import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import type { Periodo } from "@/lib/periodo";
import { periodoAnterior } from "@/lib/periodo";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

/**
 * Lecturas del dashboard.
 *
 * Todo agrega en Postgres —vistas `vw_*` y funciones `fn_*`—, siempre sobre
 * `total_eur`. Aquí no se suma nada fila a fila.
 */

const n = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/** null si el valor viene vacío de la base de datos; 0 solo si es un 0 real. */
const nOrNull = (valor: unknown): number | null => {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

export type ResumenPeriodo = {
  ingresos: number;
  gastos: number;
  beneficio: number;
  gastoAds: number;
  pedidos: number;
  impresiones: number;
  clicks: number;
};

const RESUMEN_VACIO: ResumenPeriodo = {
  ingresos: 0,
  gastos: 0,
  beneficio: 0,
  gastoAds: 0,
  pedidos: 0,
  impresiones: 0,
  clicks: 0,
};

/** Totales de un rango, calculados en la base de datos. */
export async function obtenerResumen(
  desde: string,
  hasta: string,
): Promise<ResumenPeriodo> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("fn_resumen_periodo", {
    p_desde: desde,
    p_hasta: hasta,
  });

  if (error || !data || data.length === 0) return RESUMEN_VACIO;

  const fila = data[0]!;
  return {
    ingresos: n(fila.ingresos),
    gastos: n(fila.gastos),
    beneficio: n(fila.beneficio),
    gastoAds: n(fila.gasto_ads),
    pedidos: n(fila.pedidos),
    impresiones: n(fila.impresiones),
    clicks: n(fila.clicks),
  };
}

/**
 * Resumen del periodo y del periodo anterior de la misma duración.
 * `hayAnterior` distingue «no hubo movimientos» de «no hay histórico»: sin ese
 * matiz, un negocio nuevo vería caídas del 100 % que no existen.
 */
export async function obtenerResumenComparado(periodo: Periodo): Promise<{
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  hayAnterior: boolean;
}> {
  const previo = periodoAnterior(periodo);

  const [actual, anterior] = await Promise.all([
    obtenerResumen(periodo.desde, periodo.hasta),
    obtenerResumen(previo.desde, previo.hasta),
  ]);

  const hayAnterior =
    anterior.ingresos !== 0 || anterior.gastos !== 0 || anterior.pedidos !== 0;

  return { actual, anterior, hayAnterior };
}

/**
 * Caja del negocio, partida en dos (migración 0015).
 *
 * El saldo en banco solo cuenta lo que de verdad ha entrado o salido de la
 * cuenta: los netos que ha pagado Shopify, los gastos pagados por el negocio y
 * los reembolsos a socios. Las ventas que Shopify aún no ha pagado van aparte,
 * como pendiente; y lo que un socio adelantó de su bolsillo no toca el banco.
 */
export type SaldoCaja = {
  saldoInicial: number;
  fechaInicial: string | null;
  cobradoNeto: number;
  gastosNegocio: number;
  reembolsos: number;
  saldoBanco: number;
  ventas: number;
  cobradoBruto: number;
  pendienteShopify: number;
};

/** Saldo en banco hoy. No depende del selector de periodo. */
export async function obtenerSaldoCaja(): Promise<SaldoCaja> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_saldo_banco");

  if (error || !data || data.length === 0) {
    return {
      saldoInicial: 0,
      fechaInicial: null,
      cobradoNeto: 0,
      gastosNegocio: 0,
      reembolsos: 0,
      saldoBanco: 0,
      ventas: 0,
      cobradoBruto: 0,
      pendienteShopify: 0,
    };
  }

  const fila = data[0]!;
  return {
    saldoInicial: n(fila.saldo_inicial),
    fechaInicial: fila.fecha_inicial ?? null,
    cobradoNeto: n(fila.cobrado_neto),
    gastosNegocio: n(fila.gastos_negocio),
    reembolsos: n(fila.reembolsos),
    saldoBanco: n(fila.saldo_banco),
    ventas: n(fila.ventas),
    cobradoBruto: n(fila.cobrado_bruto),
    pendienteShopify: n(fila.pendiente_shopify),
  };
}

export type PuntoDiario = {
  fecha: string;
  ingresos: number;
  gastos: number;
  beneficio: number;
  pedidos: number;
  gastoAds: number;
  impresiones: number;
  clicks: number;
};

/** Serie diaria del periodo, ya agregada por día en la vista. */
export async function obtenerSerieDiaria(
  desde: string,
  hasta: string,
): Promise<PuntoDiario[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("vw_resumen_diario")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    fecha: fila.fecha ?? "",
    ingresos: n(fila.ingresos),
    gastos: n(fila.gastos),
    beneficio: n(fila.beneficio),
    pedidos: n(fila.pedidos),
    gastoAds: n(fila.gasto_ads),
    impresiones: n(fila.impresiones),
    clicks: n(fila.clicks),
  }));
}

export type FilaMensual = {
  mes: string;
  ingresos: number;
  gastos: number;
  beneficio: number;
  margen: number | null;
  gastoAds: number;
  roas: number | null;
  pedidos: number;
  ticketMedio: number | null;
};

/** Últimos N meses, para la tabla comparativa de /kpis. */
export async function obtenerSerieMensual(meses = 12): Promise<FilaMensual[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setMonth(desde.getMonth() - (meses - 1));
  desde.setDate(1);
  const desdeIso = desde.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("vw_resumen_mensual")
    .select("*")
    .gte("mes", desdeIso)
    .order("mes", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    mes: fila.mes ?? "",
    ingresos: n(fila.ingresos),
    gastos: n(fila.gastos),
    beneficio: n(fila.beneficio),
    margen: nOrNull(fila.margen),
    gastoAds: n(fila.gasto_ads),
    roas: nOrNull(fila.roas),
    pedidos: n(fila.pedidos),
    ticketMedio: nOrNull(fila.ticket_medio),
  }));
}

export type GastoCategoria = {
  categoriaId: string;
  categoria: string;
  total: number;
};

/**
 * Gastos por categoría en un rango.
 *
 * La vista agrupa por mes, así que un periodo que cruza meses devuelve la misma
 * categoría varias veces; se consolidan aquí. Son pocas filas (categorías ×
 * meses), no el conjunto de movimientos.
 */
export async function obtenerGastosPorCategoria(
  desde: string,
  hasta: string,
): Promise<GastoCategoria[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("vw_gastos_categoria")
    .select("*")
    .gte("mes", desde.slice(0, 8) + "01")
    .lte("mes", hasta)
    .order("total", { ascending: false });

  if (error || !data) return [];

  const acumulado = new Map<string, GastoCategoria>();
  for (const fila of data) {
    const id = fila.categoria_id ?? fila.categoria ?? "";
    const actual = acumulado.get(id);
    if (actual) {
      actual.total += n(fila.total);
    } else {
      acumulado.set(id, {
        categoriaId: id,
        categoria: fila.categoria ?? "Sin categoría",
        total: n(fila.total),
      });
    }
  }

  return [...acumulado.values()]
    .map((fila) => ({ ...fila, total: Math.round(fila.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export type GastoCategoriaMes = {
  mes: string;
  categoria: string;
  total: number;
};

/** Gastos por categoría y mes, para las barras apiladas de /kpis. */
export async function obtenerGastosCategoriaPorMes(
  meses = 12,
): Promise<GastoCategoriaMes[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setMonth(desde.getMonth() - (meses - 1));
  desde.setDate(1);

  const { data, error } = await supabase
    .from("vw_gastos_categoria")
    .select("mes, categoria, total")
    .gte("mes", desde.toISOString().slice(0, 10))
    .order("mes", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    mes: fila.mes ?? "",
    categoria: fila.categoria ?? "Sin categoría",
    total: n(fila.total),
  }));
}

export type GastoPlataforma = {
  plataforma: string;
  gasto: number;
};

/**
 * Gasto publicitario por plataforma en el periodo.
 *
 * Son como mucho cuatro filas (Meta, TikTok, Google, Otra), así que se agrupan
 * aquí en lugar de crear una vista más.
 */
export async function obtenerGastoPorPlataforma(
  desde: string,
  hasta: string,
): Promise<GastoPlataforma[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("movimientos")
    .select("plataforma, total_eur")
    .eq("tipo", "gasto")
    .not("plataforma", "is", null)
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error || !data) return [];

  const acumulado = new Map<string, number>();
  for (const fila of data) {
    const plataforma = fila.plataforma ?? "Otra";
    acumulado.set(plataforma, (acumulado.get(plataforma) ?? 0) + n(fila.total_eur));
  }

  return [...acumulado.entries()]
    .map(([plataforma, gasto]) => ({
      plataforma,
      gasto: Math.round(gasto * 100) / 100,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

/** Los N movimientos más recientes del periodo. */
export async function obtenerUltimosMovimientos(
  desde: string,
  hasta: string,
  limite = 8,
): Promise<MovimientoConRelaciones[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("movimientos")
    .select(
      "*, categorias:categoria_id ( id, nombre, tipo, es_sistema ), anticipado:anticipado_por ( id, nombre, color )",
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error || !data) return [];
  return data as unknown as MovimientoConRelaciones[];
}

export type Objetivos = { facturacion: number; beneficio: number };
export type SaldoInicial = { importe: number; fecha: string };

export async function obtenerAjustes(): Promise<{
  saldoInicial: SaldoInicial;
  objetivos: Objetivos;
}> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ajustes").select("clave, valor");

  const porClave = new Map((data ?? []).map((fila) => [fila.clave, fila.valor]));

  const saldo = (porClave.get("saldo_inicial") ?? {}) as Record<string, unknown>;
  const objetivo = (porClave.get("objetivo_mes") ?? {}) as Record<string, unknown>;

  return {
    saldoInicial: {
      importe: n(saldo.importe),
      fecha:
        typeof saldo.fecha === "string"
          ? saldo.fecha
          : new Date().toISOString().slice(0, 10),
    },
    objetivos: {
      facturacion: n(objetivo.facturacion),
      beneficio: n(objetivo.beneficio),
    },
  };
}

/** Fecha del último registro diario de ventas, para el semáforo de alertas. */
export async function obtenerUltimaVenta(): Promise<string | null> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("movimientos")
    .select("fecha")
    .eq("tipo", "ingreso")
    .not("num_pedidos", "is", null)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.fecha ?? null;
}
