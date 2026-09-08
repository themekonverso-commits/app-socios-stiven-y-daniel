/**
 * Trimestres naturales.
 *
 * Sin dependencias ni `Date`: la aritmética de fechas con zonas horarias ya
 * dio bastantes disgustos en este proyecto. Un trimestre es año + número, y
 * sus límites son cadenas ISO construidas a mano.
 */

export type Trimestre = { anio: number; numero: 1 | 2 | 3 | 4 };

const FIN_MES: Record<1 | 2 | 3 | 4, string> = {
  1: "03-31",
  2: "06-30",
  3: "09-30",
  4: "12-31",
};

const INICIO_MES: Record<1 | 2 | 3 | 4, string> = {
  1: "01-01",
  2: "04-01",
  3: "07-01",
  4: "10-01",
};

export function limitesTrimestre(t: Trimestre): { desde: string; hasta: string } {
  return {
    desde: `${t.anio}-${INICIO_MES[t.numero]}`,
    hasta: `${t.anio}-${FIN_MES[t.numero]}`,
  };
}

export function etiquetaTrimestre(t: Trimestre): string {
  return `${t.numero}T ${t.anio}`;
}

/** Clave para URL y nombres de archivo: `2026-Q3`. */
export function claveTrimestre(t: Trimestre): string {
  return `${t.anio}-Q${t.numero}`;
}

export function parsearClave(clave: string | null | undefined): Trimestre | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(clave ?? "");
  if (!m) return null;
  return { anio: Number(m[1]), numero: Number(m[2]) as 1 | 2 | 3 | 4 };
}

function trimestreDeFecha(iso: string): Trimestre {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  return { anio, numero: (Math.floor((mes - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}

export function anterior(t: Trimestre): Trimestre {
  return t.numero === 1
    ? { anio: t.anio - 1, numero: 4 }
    : { anio: t.anio, numero: (t.numero - 1) as 1 | 2 | 3 | 4 };
}

/**
 * El último trimestre CERRADO: el anterior al que estamos viviendo. Es el que
 * se presenta a Hacienda, así que es el que tiene sentido por defecto.
 */
export function ultimoTrimestreCerrado(hoyIso: string): Trimestre {
  return anterior(trimestreDeFecha(hoyIso));
}

/**
 * Trimestres ofrecidos en el selector: desde el que contiene `desdeIso` (la
 * fecha del saldo inicial, es decir el arranque del negocio) hasta el último
 * cerrado. Se incluye también el trimestre en curso al final, marcado aparte,
 * porque a veces hace falta un borrador a mitad de trimestre.
 */
export function trimestresDisponibles(
  desdeIso: string,
  hoyIso: string,
): { trimestre: Trimestre; enCurso: boolean }[] {
  const primero = trimestreDeFecha(desdeIso);
  const actual = trimestreDeFecha(hoyIso);

  const lista: { trimestre: Trimestre; enCurso: boolean }[] = [];
  let cursor = primero;

  // Tope de seguridad: 40 trimestres son 10 años, de sobra para este negocio.
  for (let i = 0; i < 40; i += 1) {
    const enCurso = cursor.anio === actual.anio && cursor.numero === actual.numero;
    lista.push({ trimestre: cursor, enCurso });
    if (enCurso) break;
    cursor =
      cursor.numero === 4
        ? { anio: cursor.anio + 1, numero: 1 }
        : { anio: cursor.anio, numero: (cursor.numero + 1) as 1 | 2 | 3 | 4 };
  }

  return lista.reverse();
}
