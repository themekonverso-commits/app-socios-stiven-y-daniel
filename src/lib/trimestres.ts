import {
  endOfQuarter,
  format,
  getQuarter,
  parseISO,
  startOfQuarter,
  subQuarters,
} from "date-fns";

/** Trimestres naturales, que es como los fija el contrato. */

export type Trimestre = {
  etiqueta: string;
  inicio: string;
  fin: string;
  terminado: boolean;
};

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

export function trimestreDe(fecha: Date, hoy = new Date()): Trimestre {
  const inicio = startOfQuarter(fecha);
  const fin = endOfQuarter(fecha);
  return {
    etiqueta: `Q${getQuarter(fecha)} ${fecha.getFullYear()}`,
    inicio: iso(inicio),
    fin: iso(fin),
    terminado: fin < hoy,
  };
}

/** Los últimos N trimestres, del más reciente al más antiguo. */
export function ultimosTrimestres(cantidad = 8, hoy = new Date()): Trimestre[] {
  return Array.from({ length: cantidad }, (_, indice) =>
    trimestreDe(subQuarters(hoy, indice), hoy),
  );
}

/**
 * El primer trimestre sin cerrar, del más antiguo al más reciente: es el que
 * toca cerrar, y el que se propone por defecto en el asistente.
 *
 * `inicioNegocio` acota la búsqueda. Sin ese tope se proponía un trimestre de
 * 2024, anterior a que el negocio existiera, solo porque «no estaba cerrado».
 * Si todavía no ha terminado ningún trimestre desde el arranque, se propone el
 * actual y el asistente avisa de que sigue en curso.
 */
export function primeroSinCerrar(
  cerrados: { periodo_inicio: string; periodo_fin: string }[],
  hoy = new Date(),
  inicioNegocio?: string,
): Trimestre {
  const yaCerrado = new Set(cerrados.map((c) => `${c.periodo_inicio}|${c.periodo_fin}`));

  const candidatos = ultimosTrimestres(8, hoy)
    .filter((t) => t.terminado)
    .filter((t) => !inicioNegocio || t.fin >= inicioNegocio)
    .reverse();

  const pendiente = candidatos.find((t) => !yaCerrado.has(`${t.inicio}|${t.fin}`));
  return pendiente ?? trimestreDe(hoy, hoy);
}

export function etiquetaTrimestre(inicio: string): string {
  const fecha = parseISO(inicio);
  return `Q${getQuarter(fecha)} ${fecha.getFullYear()}`;
}
