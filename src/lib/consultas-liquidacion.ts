import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import type {
  AnticipoPendiente,
  Cierre,
  EstadoLiquidacion,
  LimiteAportacion,
  LiquidacionFinal,
  ReembolsoHistorial,
  MovimientoCupo,
  ResumenSocio,
} from "@/lib/tipos-liquidacion";

/**
 * Lecturas de la liquidación.
 *
 * Todo el cálculo lo hace Postgres: estas funciones solo transportan. Si algún
 * día una cifra sale mal, se arregla en la función SQL, no aquí.
 */

const n = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/** Foto completa de la liquidación a una fecha (R3, R4, R5). */
export async function obtenerEstadoLiquidacion(
  fechaCorte: string,
): Promise<EstadoLiquidacion | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_estado_liquidacion", {
    p_fecha_corte: fechaCorte,
  });

  if (error || !data) return null;
  return data as unknown as EstadoLiquidacion;
}

/** Liquidación final por mitades (R7). */
export async function obtenerLiquidacionFinal(): Promise<LiquidacionFinal | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_liquidacion_final");

  if (error || !data) return null;
  return data as unknown as LiquidacionFinal;
}

/** Prorrata (R3.2) de un importe disponible entre lo pendiente de cada socio. */
export async function calcularProrrata(
  disponible: number,
): Promise<Record<string, number> | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_prorrata_reembolso", {
    p_disponible: disponible,
  });

  if (error || !data) return null;
  return data as unknown as Record<string, number>;
}

export async function obtenerResumenSocios(): Promise<ResumenSocio[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("vw_anticipos_socio")
    .select("*")
    .order("nombre", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    socio_id: fila.socio_id ?? "",
    nombre: fila.nombre ?? "",
    color: fila.color ?? null,
    anticipado: n(fila.anticipado),
    anticipado_cupo: n(fila.anticipado_cupo),
    anticipado_otros: n(fila.anticipado_otros),
    reembolsado: n(fila.reembolsado),
    pendiente: n(fila.pendiente),
    num_anticipos: n(fila.num_anticipos),
  }));
}

/** Anticipos con saldo pendiente, del más antiguo al más reciente. */
export async function obtenerAnticiposPendientes(): Promise<AnticipoPendiente[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("vw_anticipos_pendientes")
    .select("*")
    // Lo más antiguo primero: es lo que toca devolver antes.
    .order("fecha", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    id: fila.id ?? "",
    fecha: fila.fecha ?? "",
    concepto: fila.concepto ?? "",
    categoria: fila.categoria ?? "",
    socio_id: fila.socio_id ?? "",
    socio: fila.socio ?? "",
    socio_color: fila.socio_color ?? null,
    total_eur: n(fila.total_eur),
    reembolsado_eur: n(fila.reembolsado_eur),
    pendiente_eur: n(fila.pendiente_eur),
  }));
}

export async function obtenerHistorialReembolsos(): Promise<ReembolsoHistorial[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("reembolsos")
    .select(
      "*, socio:socio_id ( nombre, color ), autor:created_by ( nombre ), reembolso_movimientos ( movimiento_id )",
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map((fila) => {
    const socio = fila.socio as { nombre?: string; color?: string } | null;
    const autor = fila.autor as { nombre?: string } | null;
    const lineas = (fila.reembolso_movimientos ?? []) as unknown[];

    return {
      id: String(fila.id ?? ""),
      fecha: String(fila.fecha ?? ""),
      socio_id: String(fila.socio_id ?? ""),
      socio: socio?.nombre ?? "",
      socio_color: socio?.color ?? null,
      importe_eur: n(fila.importe_eur),
      metodo: (fila.metodo as string) ?? null,
      notas: (fila.notas as string) ?? null,
      num_anticipos: lineas.length,
      registrado_por: autor?.nombre ?? "",
    };
  });
}

export async function obtenerCierres(): Promise<Cierre[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cierres")
    .select("*")
    .order("periodo_fin", { ascending: false });

  if (error || !data) return [];
  return data as unknown as Cierre[];
}

export async function obtenerCierre(id: string): Promise<Cierre | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cierres")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Cierre;
}

/** «a», «a y b», «a, b y c». Null si no hay nada. */
function enumerar(elementos: string[]): string | null {
  if (elementos.length === 0) return null;
  if (elementos.length === 1) return elementos[0]!;
  return `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`;
}

/** R6 — límite de aportación acordado y umbral de aviso. */
export async function obtenerLimiteAportacion(): Promise<{
  limite: LimiteAportacion;
  avisoPct: number;
}> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ajustes")
    .select("clave, valor")
    .in("clave", ["limite_aportacion", "aviso_limite_pct"]);

  const porClave = new Map((data ?? []).map((fila) => [fila.clave, fila.valor]));
  const limite = (porClave.get("limite_aportacion") ?? {}) as Record<string, unknown>;
  const aviso = (porClave.get("aviso_limite_pct") ?? {}) as Record<string, unknown>;

  // Desde la 0016 el ámbito es una lista; se acepta también el categoria_id
  // de la 0011, igual que hace fn_categorias_limite() en la base de datos.
  const ids: string[] = Array.isArray(limite.categoria_ids)
    ? (limite.categoria_ids as string[])
    : limite.categoria_id
      ? [limite.categoria_id as string]
      : [];

  // Los nombres solo sirven para el texto de la pantalla. Quien decide qué
  // entra en el cupo es la vista, con los ids: aquí no se filtra nada.
  let categorias: { id: string; nombre: string }[] = [];
  if (ids.length > 0) {
    const { data: filas } = await supabase
      .from("categorias")
      .select("id, nombre")
      .in("id", ids);
    const porId = new Map((filas ?? []).map((c) => [c.id, c.nombre]));
    categorias = ids
      .filter((id) => porId.has(id))
      .map((id) => ({ id, nombre: porId.get(id)! }));
  }

  return {
    limite: {
      socio_id: (limite.socio_id as string) ?? null,
      importe: n(limite.importe),
      categorias,
      ambito: enumerar(categorias.map((c) => c.nombre.toLowerCase())),
    },
    avisoPct: n(aviso.porcentaje) || 80,
  };
}

/**
 * R6 — los últimos anticipos que consumen el cupo de la tarjeta de un socio.
 *
 * Mismo criterio que `anticipado_cupo` en la vista: gastos que adelantó ese
 * socio en alguna de las categorías del cupo. Sin categorías, todos sus
 * anticipos. Devuelve también el total y la fecha del más antiguo, para que el
 * enlace a /movimientos abarque el histórico completo y no solo el mes.
 */
export async function obtenerMovimientosCupo(
  socioId: string,
  categoriaIds: string[],
  limite = 5,
): Promise<{ movimientos: MovimientoCupo[]; total: number; desde: string | null }> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("movimientos")
    .select("id, fecha, concepto, total_eur, categoria:categoria_id ( nombre )", {
      count: "exact",
    })
    .eq("tipo", "gasto")
    .eq("anticipado_por", socioId);
  if (categoriaIds.length > 0) consulta = consulta.in("categoria_id", categoriaIds);

  let primera = supabase
    .from("movimientos")
    .select("fecha")
    .eq("tipo", "gasto")
    .eq("anticipado_por", socioId);
  if (categoriaIds.length > 0) primera = primera.in("categoria_id", categoriaIds);

  const [{ data, count }, { data: masAntiguo }] = await Promise.all([
    consulta
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite),
    primera.order("fecha", { ascending: true }).limit(1).maybeSingle(),
  ]);

  return {
    movimientos: (data ?? []).map((fila) => ({
      id: fila.id,
      fecha: fila.fecha,
      concepto: fila.concepto,
      total_eur: n(fila.total_eur),
      categoria: (fila.categoria as { nombre?: string } | null)?.nombre ?? "—",
    })),
    total: count ?? 0,
    desde: masAntiguo?.fecha ?? null,
  };
}

/** Id del usuario autenticado, para saber qué casilla de aprobación es suya. */
export async function obtenerUsuarioActual(): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
