import "server-only";

import { format } from "date-fns";

import { crearClienteServidor } from "@/lib/supabase/server";
import { argsAmbito, filtrarPorAmbito, type Ambito } from "@/lib/ambito";
import type { Periodo } from "@/lib/periodo";
import { hoyEnEspana, periodoAnterior } from "@/lib/periodo";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

/**
 * Lecturas del dashboard y de /kpis.
 *
 * Todo agrega en Postgres —funciones `fn_*` de la migración 0018—, siempre
 * sobre `total_eur`. Aquí no se suma nada fila a fila.
 *
 * Casi todo va por ámbito (una tienda, «Todas» o solo «General»). Lo que es
 * de la sociedad —la tesorería y el cupo de la tarjeta— no lo lleva: es el
 * mismo número se mire desde donde se mire.
 */

/**
 * Argumentos de ámbito para las funciones SQL. Los tipos generados declaran
 * `p_tienda: string`, pero la función admite null («todas» o «general»): sin
 * esta conversión TypeScript no deja pasarlo.
 */
function args(ambito: Ambito): { p_tienda: string; p_solo_general: boolean } {
  return argsAmbito(ambito) as { p_tienda: string; p_solo_general: boolean };
}

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

/** Totales de un rango en el ámbito, calculados en la base de datos. */
export async function obtenerResumen(
  desde: string,
  hasta: string,
  ambito: Ambito,
): Promise<ResumenPeriodo> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("fn_resumen_periodo", {
    p_desde: desde,
    p_hasta: hasta,
    ...args(ambito),
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
export async function obtenerResumenComparado(
  periodo: Periodo,
  ambito: Ambito,
): Promise<{
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  hayAnterior: boolean;
}> {
  const previo = periodoAnterior(periodo);

  const [actual, anterior] = await Promise.all([
    obtenerResumen(periodo.desde, periodo.hasta, ambito),
    obtenerResumen(previo.desde, previo.hasta, ambito),
  ]);

  const hayAnterior =
    anterior.ingresos !== 0 || anterior.gastos !== 0 || anterior.pedidos !== 0;

  return { actual, anterior, hayAnterior };
}

/**
 * Beneficio de la tienda desde siempre hasta hoy (ingresos − gastos de todos
 * sus movimientos). OJO: es beneficio, no caja. La caja es de la sociedad.
 */
export async function obtenerBeneficioAcumulado(ambito: Ambito): Promise<number> {
  // format y no toISOString: hoyEnEspana() es medianoche local y en UTC
  // podría caer el día anterior.
  const hoy = format(hoyEnEspana(), "yyyy-MM-dd");
  const resumen = await obtenerResumen("2000-01-01", hoy, ambito);
  return resumen.beneficio;
}

/** ¿Hay algún movimiento en el ámbito, de cualquier fecha? Para los estados vacíos. */
export async function hayMovimientos(ambito: Ambito): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { count, error } = await filtrarPorAmbito(
    supabase.from("movimientos").select("id", { count: "exact", head: true }),
    ambito,
  );
  // Ante un error, mejor enseñar el dashboard (vacío) que un falso «empieza aquí».
  if (error) return true;
  return (count ?? 0) > 0;
}

/**
 * Una fila por tienda y otra para General (tienda_id null), con las cifras
 * del periodo. Lo calcula `fn_comparativa_tiendas`; las archivadas solo
 * salen si tuvieron movimientos en el periodo.
 */
export type FilaComparativa = {
  tiendaId: string | null;
  nombre: string;
  color: string | null;
  estado: string | null;
  ingresos: number;
  gastos: number;
  beneficio: number;
  gastoAds: number;
  roas: number | null;
  margen: number | null;
  pedidos: number;
};

export async function obtenerComparativaTiendas(
  desde: string,
  hasta: string,
): Promise<FilaComparativa[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_comparativa_tiendas", {
    p_desde: desde,
    p_hasta: hasta,
  });

  if (error || !data) return [];

  return data.map((fila) => ({
    tiendaId: fila.tienda_id ?? null,
    nombre: fila.nombre ?? "",
    color: fila.color ?? null,
    estado: fila.estado ?? null,
    ingresos: n(fila.ingresos),
    gastos: n(fila.gastos),
    beneficio: n(fila.beneficio),
    gastoAds: n(fila.gasto_ads),
    roas: nOrNull(fila.roas),
    margen: nOrNull(fila.margen),
    pedidos: n(fila.pedidos),
  }));
}

/**
 * Tesorería del negocio (migración 0017): dos cuentas y lo pendiente.
 *
 *   · Banco: los netos que paga Shopify Payments y los traspasos desde
 *     PayPal, menos los gastos y reembolsos pagados desde el banco.
 *   · PayPal: los netos de los cobros de PayPal, menos los traspasos al banco
 *     y los gastos y reembolsos pagados desde PayPal.
 *   · Pendiente de cobro: ventas de /diario que ningún cobro de su método
 *     cubre todavía.
 *
 * Lo que un socio adelantó de su bolsillo no sale de ninguna de las dos.
 */
export type Tesoreria = {
  saldoInicialBanco: number;
  fechaInicialBanco: string | null;
  saldoInicialPaypal: number;
  fechaInicialPaypal: string | null;
  saldoBanco: number;
  saldoPaypal: number;
  cajaTotal: number;
  pendienteShopify: number;
  pendientePaypal: number;
  pendienteTotal: number;
};

const TESORERIA_VACIA: Tesoreria = {
  saldoInicialBanco: 0,
  fechaInicialBanco: null,
  saldoInicialPaypal: 0,
  fechaInicialPaypal: null,
  saldoBanco: 0,
  saldoPaypal: 0,
  cajaTotal: 0,
  pendienteShopify: 0,
  pendientePaypal: 0,
  pendienteTotal: 0,
};

/**
 * Tesorería a día de hoy. Es de la sociedad: no depende del selector de
 * periodo ni de la tienda.
 */
export async function obtenerTesoreria(): Promise<Tesoreria> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_tesoreria");

  if (error || !data || data.length === 0) return TESORERIA_VACIA;

  const fila = data[0]!;
  return {
    saldoInicialBanco: n(fila.saldo_inicial_banco),
    fechaInicialBanco: fila.fecha_inicial_banco ?? null,
    saldoInicialPaypal: n(fila.saldo_inicial_paypal),
    fechaInicialPaypal: fila.fecha_inicial_paypal ?? null,
    saldoBanco: n(fila.saldo_banco),
    saldoPaypal: n(fila.saldo_paypal),
    cajaTotal: n(fila.caja_total),
    pendienteShopify: n(fila.pendiente_shopify),
    pendientePaypal: n(fila.pendiente_paypal),
    pendienteTotal: n(fila.pendiente_total),
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

/** Serie diaria del periodo en el ámbito, ya agregada por día en Postgres. */
export async function obtenerSerieDiaria(
  desde: string,
  hasta: string,
  ambito: Ambito,
): Promise<PuntoDiario[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .rpc("fn_resumen_diario", args(ambito))
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

/** Últimos N meses del ámbito, para la tabla comparativa de /kpis. */
export async function obtenerSerieMensual(
  meses: number,
  ambito: Ambito,
): Promise<FilaMensual[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setMonth(desde.getMonth() - (meses - 1));
  desde.setDate(1);
  const desdeIso = desde.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .rpc("fn_resumen_mensual", args(ambito))
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
 * Gastos por categoría en un rango y un ámbito.
 *
 * La función agrupa por mes, así que un periodo que cruza meses devuelve la misma
 * categoría varias veces; se consolidan aquí. Son pocas filas (categorías ×
 * meses), no el conjunto de movimientos.
 */
export async function obtenerGastosPorCategoria(
  desde: string,
  hasta: string,
  ambito: Ambito,
): Promise<GastoCategoria[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .rpc("fn_gastos_categoria", args(ambito))
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

/** Gastos por categoría y mes del ámbito, para las barras apiladas de /kpis. */
export async function obtenerGastosCategoriaPorMes(
  meses: number,
  ambito: Ambito,
): Promise<GastoCategoriaMes[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setMonth(desde.getMonth() - (meses - 1));
  desde.setDate(1);

  const { data, error } = await supabase
    .rpc("fn_gastos_categoria", args(ambito))
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
  ambito: Ambito,
): Promise<GastoPlataforma[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await filtrarPorAmbito(
    supabase
      .from("movimientos")
      .select("plataforma, total_eur")
      .eq("tipo", "gasto")
      .not("plataforma", "is", null)
      .gte("fecha", desde)
      .lte("fecha", hasta),
    ambito,
  );

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

/** Los N movimientos más recientes del periodo en el ámbito. */
export async function obtenerUltimosMovimientos(
  desde: string,
  hasta: string,
  limite: number,
  ambito: Ambito,
): Promise<MovimientoConRelaciones[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await filtrarPorAmbito(
    supabase
      .from("movimientos")
      .select(
        "*, categorias:categoria_id ( id, nombre, tipo, es_sistema ), anticipado:anticipado_por ( id, nombre, color )",
      )
      .gte("fecha", desde)
      .lte("fecha", hasta),
    ambito,
  )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error || !data) return [];
  return data as unknown as MovimientoConRelaciones[];
}

export type SaldoInicial = { importe: number; fecha: string };

/**
 * Saldos de partida del banco y de PayPal (globales). Los objetivos
 * mensuales ya no viven en `ajustes`: son de cada tienda (`tiendas.objetivo_mes`).
 */
export async function obtenerAjustes(): Promise<{
  saldoInicial: SaldoInicial;
  saldoInicialPaypal: SaldoInicial;
}> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ajustes")
    .select("clave, valor")
    .in("clave", ["saldo_inicial", "saldo_inicial_paypal"]);

  const porClave = new Map((data ?? []).map((fila) => [fila.clave, fila.valor]));

  const saldo = (porClave.get("saldo_inicial") ?? {}) as Record<string, unknown>;
  const paypal = (porClave.get("saldo_inicial_paypal") ?? {}) as Record<string, unknown>;

  return {
    saldoInicial: {
      importe: n(saldo.importe),
      fecha:
        typeof saldo.fecha === "string"
          ? saldo.fecha
          : new Date().toISOString().slice(0, 10),
    },
    saldoInicialPaypal: {
      importe: n(paypal.importe),
      // Sin fila propia, PayPal arranca el mismo día que el banco.
      fecha:
        typeof paypal.fecha === "string"
          ? paypal.fecha
          : typeof saldo.fecha === "string"
            ? saldo.fecha
            : new Date().toISOString().slice(0, 10),
    },
  };
}

/**
 * Fecha del último registro diario de ventas del ámbito, para el semáforo y
 * para invitar a registrar el primer día en una tienda nueva.
 */
export async function obtenerUltimaVenta(ambito: Ambito): Promise<string | null> {
  const supabase = await crearClienteServidor();

  const { data, error } = await filtrarPorAmbito(
    supabase
      .from("movimientos")
      .select("fecha")
      .eq("tipo", "ingreso")
      .not("num_pedidos", "is", null),
    ambito,
  )
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.fecha ?? null;
}
