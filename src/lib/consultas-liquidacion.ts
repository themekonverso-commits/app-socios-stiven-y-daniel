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
 *
 * Es GLOBAL (0018): nada de aquí recibe ni aplica el ámbito de tienda. La
 * liquidación suma todas las tiendas y General, y así las pérdidas de una
 * compensan los beneficios de otra.
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
    tienda_id: fila.tienda_id ?? null,
    tienda: fila.tienda ?? "General / Sociedad",
    tienda_color: fila.tienda_color ?? null,
    medio_pago: fila.medio_pago ?? null,
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

  const filas = data as unknown as Record<string, unknown>[];
  const lineasDe = (fila: Record<string, unknown>) =>
    (fila.reembolso_movimientos ?? []) as { movimiento_id: string }[];

  // La tienda de cada anticipo cubierto, en una segunda lectura: incrustarla
  // en la primera es ambiguo para PostgREST (la misma clave foránea se ve
  // también a través de las vistas).
  const ids = [...new Set(filas.flatMap((f) => lineasDe(f).map((l) => l.movimiento_id)))];
  const tiendaDe = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: movimientos } = await supabase
      .from("movimientos")
      .select("id, tienda_id")
      .in("id", ids);
    for (const m of movimientos ?? []) tiendaDe.set(m.id, m.tienda_id);
  }

  return filas.map((fila) => {
    const socio = fila.socio as { nombre?: string; color?: string } | null;
    const autor = fila.autor as { nombre?: string } | null;
    const lineas = lineasDe(fila);
    const tiendas = [
      ...new Set(lineas.map((l) => tiendaDe.get(l.movimiento_id) ?? null)),
    ];

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
      tiendas,
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

/**
 * R6 — cupo acordado de la tarjeta y umbral de aviso.
 *
 * Desde la 0018 el cupo mide lo pagado con la tarjeta (medio_pago =
 * tarjeta_daniel), de todas las tiendas y de General: ya no hay categorías que
 * leer. Para las cifras en vivo está `obtenerCupoTarjeta()` (lib/consultas-cupo).
 */
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

  return {
    limite: {
      socio_id: (limite.socio_id as string) ?? null,
      importe: n(limite.importe),
      ambito: "los gastos pagados con la tarjeta",
    },
    avisoPct: n(aviso.porcentaje) || 80,
  };
}

/**
 * R6 — los últimos gastos pagados con la tarjeta, de cualquier tienda y de
 * General. Mismo criterio que `fn_cupo_tarjeta()` y que `anticipado_cupo`:
 * medio_pago = 'tarjeta_daniel'. Devuelve también cuántos hay en total, para
 * saber si hace falta el enlace a /movimientos.
 */
export async function obtenerMovimientosCupo(
  limite = 5,
): Promise<{ movimientos: MovimientoCupo[]; total: number }> {
  const supabase = await crearClienteServidor();

  const { data, count } = await supabase
    .from("movimientos")
    .select("id, fecha, concepto, total_eur, tienda_id, categoria:categoria_id ( nombre )", {
      count: "exact",
    })
    .eq("tipo", "gasto")
    .eq("medio_pago", "tarjeta_daniel")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  return {
    movimientos: (data ?? []).map((fila) => ({
      id: fila.id,
      fecha: fila.fecha,
      concepto: fila.concepto,
      total_eur: n(fila.total_eur),
      categoria: (fila.categoria as { nombre?: string } | null)?.nombre ?? "—",
      tienda_id: fila.tienda_id,
    })),
    total: count ?? 0,
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
