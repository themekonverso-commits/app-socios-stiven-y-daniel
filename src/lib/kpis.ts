import { redondear2 } from "@/lib/dinero";

/**
 * Cálculos de los KPI.
 *
 * Norma de esta casa: `null` significa «no hay dato», y la interfaz lo pinta
 * como un guion. Nunca se devuelve 0 para disimular una división imposible,
 * porque «0,00 €» y «no lo sé» son cosas distintas y confundirlas lleva a
 * tomar decisiones sobre cifras inventadas. Tampoco sale nunca NaN ni Infinity.
 */

/** Redondeo a 1 decimal, para ROAS y porcentajes. */
export function redondear1(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 10) / 10;
}

/** División protegida: denominador cero o no finito → null. */
export function dividir(
  numerador: number,
  denominador: number,
  decimales: 1 | 2 = 2,
): number | null {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador)) return null;
  if (denominador === 0) return null;
  const resultado = numerador / denominador;
  if (!Number.isFinite(resultado)) return null;
  return decimales === 1 ? redondear1(resultado) : redondear2(resultado);
}

/**
 * Variación porcentual entre dos periodos: (actual − anterior) / |anterior|.
 *
 * Si el periodo anterior es 0 devuelve null: no existe «infinito por ciento»,
 * y enseñar +100 % cuando antes no había nada sería mentir.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return null;
  if (anterior === 0) return null;
  return redondear1(((actual - anterior) / Math.abs(anterior)) * 100);
}

/**
 * Porcentaje de una parte sobre un total.
 *
 * El redondeo se aplica UNA sola vez, sobre el porcentaje final. Redondear
 * antes el cociente a dos decimales convertía 0,2060… en 0,21 y el resultado
 * salía 21,0 % en vez de 20,6 %: un error de casi medio punto, y encima
 * discrepaba de lo que calcula la vista en Postgres.
 */
export function porcentaje(parte: number, total: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(total)) return null;
  if (total === 0) return null;
  const resultado = (parte / total) * 100;
  return Number.isFinite(resultado) ? redondear1(resultado) : null;
}

/** Margen en porcentaje sobre la facturación. */
export function margen(beneficio: number, facturacion: number): number | null {
  return porcentaje(beneficio, facturacion);
}

/** Retorno por cada euro invertido en publicidad. */
export function calcularRoas(
  facturacion: number,
  gastoAds: number,
): number | null {
  return dividir(facturacion, gastoAds, 1);
}

export type NivelRoas = "malo" | "regular" | "bueno" | "sin-datos";

/**
 * Umbrales de ROAS: rojo por debajo de 1,5x, ámbar hasta 2,5x, verde encima.
 * El nivel se usa para el color Y para el texto, porque el color no puede ser
 * el único indicador.
 */
export function nivelRoas(roas: number | null): NivelRoas {
  if (roas === null) return "sin-datos";
  if (roas < 1.5) return "malo";
  if (roas < 2.5) return "regular";
  return "bueno";
}

export const CLASE_NIVEL_ROAS: Record<NivelRoas, string> = {
  malo: "text-danger",
  regular: "text-warning",
  bueno: "text-success",
  "sin-datos": "text-text-muted",
};

export const ETIQUETA_NIVEL_ROAS: Record<NivelRoas, string> = {
  malo: "Por debajo del umbral",
  regular: "Ajustado",
  bueno: "Saludable",
  "sin-datos": "Sin inversión registrada",
};

/**
 * ¿La variación es una mejora?
 *
 * En los gastos, subir es empeorar. Sin esto, un mes con un 40 % más de gasto
 * publicitario se pintaría de verde.
 */
export function esMejora(
  valor: number | null,
  sentido: "mas-es-mejor" | "menos-es-mejor",
): boolean | null {
  if (valor === null || valor === 0) return null;
  return sentido === "mas-es-mejor" ? valor > 0 : valor < 0;
}
