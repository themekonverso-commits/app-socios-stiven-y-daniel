import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import { porcentaje } from "@/lib/kpis";
import { redondear2 } from "@/lib/dinero";

/**
 * Lecturas de los cobros de la pasarela. La conciliación con /diario la
 * calcula `vw_cobros_conciliacion` en Postgres, no el navegador.
 */

const n = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

export type CobroConciliado = {
  id: string;
  fecha_cobro: string;
  periodo_desde: string;
  periodo_hasta: string;
  plataforma: string;
  importe_bruto: number;
  comisiones: number;
  devoluciones: number;
  otros_ajustes: number;
  importe_neto: number;
  referencia: string | null;
  notas: string | null;
  created_by: string;
  autor_nombre: string | null;
  ventas_registradas: number;
  diferencia: number;
  cuadra: boolean;
  /** null si el bruto es 0. */
  pct_comision: number | null;
};

/** Cobros que llegaron al banco en el rango, del más reciente al más antiguo. */
export async function obtenerCobros(
  desde: string,
  hasta: string,
): Promise<{ cobros: CobroConciliado[]; error: string | null }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("vw_cobros_conciliacion")
    .select("*")
    .gte("fecha_cobro", desde)
    .lte("fecha_cobro", hasta)
    .order("fecha_cobro", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { cobros: [], error: error.message };

  const cobros = (data ?? []).map((f) => ({
    id: f.id!,
    fecha_cobro: f.fecha_cobro!,
    periodo_desde: f.periodo_desde!,
    periodo_hasta: f.periodo_hasta!,
    plataforma: f.plataforma ?? "Shopify Payments",
    importe_bruto: n(f.importe_bruto),
    comisiones: n(f.comisiones),
    devoluciones: n(f.devoluciones),
    otros_ajustes: n(f.otros_ajustes),
    importe_neto: n(f.importe_neto),
    referencia: f.referencia,
    notas: f.notas,
    created_by: f.created_by!,
    autor_nombre: f.autor_nombre,
    ventas_registradas: n(f.ventas_registradas),
    diferencia: n(f.diferencia),
    cuadra: Boolean(f.cuadra),
    pct_comision: f.pct_comision === null ? null : n(f.pct_comision),
  }));

  return { cobros, error: null };
}

export type ResumenCobros = {
  numero: number;
  cobrado: number;
  comisiones: number;
  bruto: number;
  /** Comisiones sobre bruto, en %. null si no hubo bruto. */
  pctMedio: number | null;
};

/**
 * Las tres cifras de cabecera de /cobros y la alerta del semáforo.
 *
 * El % medio es comisiones totales entre bruto total, no la media de los
 * porcentajes: un payout pequeño con una comisión fija alta no debe pesar lo
 * mismo que uno grande.
 */
export function resumirCobros(cobros: CobroConciliado[]): ResumenCobros {
  const cobrado = redondear2(cobros.reduce((s, c) => s + c.importe_neto, 0));
  const comisiones = redondear2(cobros.reduce((s, c) => s + c.comisiones, 0));
  const bruto = redondear2(cobros.reduce((s, c) => s + c.importe_bruto, 0));
  return {
    numero: cobros.length,
    cobrado,
    comisiones,
    bruto,
    pctMedio: porcentaje(comisiones, bruto),
  };
}

export async function obtenerResumenCobros(
  desde: string,
  hasta: string,
): Promise<ResumenCobros> {
  const { cobros } = await obtenerCobros(desde, hasta);
  return resumirCobros(cobros);
}
