import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import { porcentaje } from "@/lib/kpis";
import { redondear2 } from "@/lib/dinero";
import { metodoDePlataforma, type MetodoCobro, type PlataformaCobro } from "@/lib/metodos-cobro";
import { filtrarPorAmbito, type Ambito } from "@/lib/ambito";

/**
 * Lecturas de los cobros de la pasarela. La conciliación con /diario la
 * calcula `vw_cobros_conciliacion` en Postgres, no el navegador.
 *
 * Multi-tienda (0018): un cobro siempre es de una tienda y concilia solo con
 * las ventas de esa tienda y de su método. Las lecturas por tienda reciben el
 * ámbito como último parámetro (sin él, no filtran). En «General» no hay
 * cobros: un ingreso nunca es de la sociedad. Los traspasos PayPal → Banco sí
 * son de la sociedad y no se filtran nunca.
 */

const n = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

export type CobroConciliado = {
  id: string;
  /** Tienda del cobro. Nunca es null: un cobro siempre es de una tienda. */
  tienda_id: string;
  fecha_cobro: string;
  periodo_desde: string;
  periodo_hasta: string;
  plataforma: PlataformaCobro;
  metodo: MetodoCobro;
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
  /** Otros cobros de la MISMA plataforma con el periodo cruzado. */
  solapados: { id: string; fecha_cobro: string; referencia: string | null }[];
};

/**
 * Cobros que llegaron a su cuenta (banco o PayPal) en el rango, del más
 * reciente al más antiguo. Con `plataforma`, solo los de esa plataforma; con
 * `ambito`, solo los de esa tienda.
 */
export async function obtenerCobros(
  desde: string,
  hasta: string,
  plataforma?: PlataformaCobro,
  ambito?: Ambito,
): Promise<{ cobros: CobroConciliado[]; error: string | null }> {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("vw_cobros_conciliacion")
    .select("*")
    .gte("fecha_cobro", desde)
    .lte("fecha_cobro", hasta);
  if (plataforma) consulta = consulta.eq("plataforma", plataforma);
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);

  const { data, error } = await consulta
    .order("fecha_cobro", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { cobros: [], error: error.message };

  const cobros = (data ?? []).map((f) => ({
    id: f.id!,
    tienda_id: f.tienda_id!,
    fecha_cobro: f.fecha_cobro!,
    periodo_desde: f.periodo_desde!,
    periodo_hasta: f.periodo_hasta!,
    plataforma: (f.plataforma === "PayPal" ? "PayPal" : "Shopify Payments") as PlataformaCobro,
    metodo: metodoDePlataforma(f.plataforma ?? ""),
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
    solapados: Array.isArray(f.solapados)
      ? (f.solapados as { id: string; fecha_cobro: string; referencia: string | null }[])
      : [],
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
 * Las tres cifras de cabecera de /cobros (para el filtro elegido) y la
 * alerta del semáforo.
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
  ambito?: Ambito,
): Promise<ResumenCobros> {
  const { cobros } = await obtenerCobros(desde, hasta, undefined, ambito);
  return resumirCobros(cobros);
}

export type Traspaso = {
  id: string;
  fecha: string;
  importe: number;
  comision: number;
  importe_neto: number;
  referencia: string | null;
  notas: string | null;
  created_by: string;
  autor_nombre: string | null;
};

/**
 * Traspasos PayPal → Banco del rango, del más reciente al más antiguo. Son de
 * la sociedad (PayPal y el banco no son de ninguna tienda): no llevan ámbito.
 */
export async function obtenerTraspasos(
  desde: string,
  hasta: string,
): Promise<{ traspasos: Traspaso[]; error: string | null }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("traspasos_paypal")
    .select("*, autor:created_by ( nombre )")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { traspasos: [], error: error.message };

  return {
    traspasos: (data ?? []).map((t) => ({
      id: t.id,
      fecha: t.fecha,
      importe: n(t.importe),
      comision: n(t.comision),
      importe_neto: n(t.importe_neto),
      referencia: t.referencia,
      notas: t.notas,
      created_by: t.created_by,
      autor_nombre: (t.autor as { nombre?: string } | null)?.nombre ?? null,
    })),
    error: null,
  };
}
