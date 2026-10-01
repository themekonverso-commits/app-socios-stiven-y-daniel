import { redondear2 } from "@/lib/dinero";
import { formatearEuros } from "@/lib/formato";

/**
 * Aritmética y textos de los cobros de la pasarela. Funciones puras: las usan
 * el formulario (neto en vivo), el Server Action y el listado.
 */

/** Lo que llega al banco. Misma fórmula que el CHECK de la 0015. */
export function calcularNeto(d: {
  importe_bruto: number;
  comisiones: number;
  devoluciones: number;
  otros_ajustes: number;
}): number {
  return redondear2(d.importe_bruto - d.comisiones - d.devoluciones + d.otros_ajustes);
}

export type Conciliacion = {
  bruto: number;
  ventas: number;
  /** bruto − ventas. Positivo: faltan ventas por registrar en /diario. */
  diferencia: number;
  cuadra: boolean;
};

export function conciliar(bruto: number, ventas: number): Conciliacion {
  const diferencia = redondear2(bruto - ventas);
  return { bruto, ventas, diferencia, cuadra: Math.abs(diferencia) < 0.005 };
}

/**
 * «Shopify dice 320,00 € de ventas, en /diario hay 305,00 €. Faltan 15,00 €
 * por registrar.» — o la frase inversa si en /diario hay de más.
 */
export function mensajeConciliacion(c: Conciliacion, plataforma = "Shopify"): string {
  const quien = /^shopify/i.test(plataforma) ? "Shopify" : plataforma;
  const base = `${quien} dice ${formatearEuros(c.bruto)} de ventas, en /diario hay ${formatearEuros(c.ventas)}.`;
  if (c.cuadra) return `${base} Cuadra.`;
  return c.diferencia > 0
    ? `${base} Faltan ${formatearEuros(c.diferencia)} por registrar.`
    : `${base} Sobran ${formatearEuros(-c.diferencia)} en /diario: revisa si hay un día duplicado o una venta que aún no se ha cobrado.`;
}
