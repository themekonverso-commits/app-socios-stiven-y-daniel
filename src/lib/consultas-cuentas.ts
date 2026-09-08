import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import { redondear2 } from "@/lib/dinero";
import type { FiltrosCuentas } from "@/lib/esquemas/cuentas";
import type {
  CuentaConCoste,
  NotaConAutor,
  ResumenCuentas,
} from "@/lib/tipos-cuentas";

/**
 * Lecturas de cuentas y notas.
 *
 * Los filtros se aplican en la consulta, no en el navegador, y el coste
 * mensual ya viene normalizado por `vw_cuentas_coste`.
 */

const n = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

function escaparBusqueda(termino: string): string {
  return termino.replace(/[%_,()]/g, " ").trim();
}

export async function obtenerCuentas(
  filtros: FiltrosCuentas,
): Promise<CuentaConCoste[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("vw_cuentas_coste").select("*");

  if (filtros.tipo !== "todos") consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.estado !== "todos") consulta = consulta.eq("estado", filtros.estado);
  if (filtros.periodicidad !== "todos") {
    consulta = consulta.eq("periodicidad", filtros.periodicidad);
  }
  if (filtros.titular !== "todos") {
    consulta =
      filtros.titular === "sin-asignar"
        ? consulta.is("titular_id", null)
        : consulta.eq("titular_id", filtros.titular);
  }

  const termino = escaparBusqueda(filtros.q);
  if (termino) {
    consulta = consulta.or(`nombre.ilike.%${termino}%,notas.ilike.%${termino}%`);
  }

  const { data, error } = await consulta.order("nombre", { ascending: true });

  if (error || !data) return [];
  return data as unknown as CuentaConCoste[];
}

/** Todas las cuentas sin filtrar: el resumen es del negocio, no de la vista. */
export async function obtenerResumenCuentas(): Promise<ResumenCuentas> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.from("vw_cuentas_coste").select("*");

  const vacio: ResumenCuentas = {
    costeMensual: 0,
    costeAnual: 0,
    activas: 0,
    pausadas: 0,
    canceladas: 0,
    proxima: null,
    porTitular: [],
    vencidas: [],
    proximas: [],
  };

  if (error || !data) return vacio;

  const cuentas = data as unknown as CuentaConCoste[];
  const activas = cuentas.filter((c) => c.estado === "activa");

  const costeMensual = redondear2(
    activas.reduce((suma, c) => suma + n(c.coste_mensual_eur), 0),
  );

  const porTitular = new Map<
    string,
    { socio_id: string; nombre: string; color: string | null; cuentas: number; costeMensual: number }
  >();

  for (const cuenta of activas) {
    const id = cuenta.titular_id ?? "sin-asignar";
    const actual = porTitular.get(id) ?? {
      socio_id: id,
      nombre: cuenta.titular_nombre ?? "Sin asignar",
      color: cuenta.titular_color ?? null,
      cuentas: 0,
      costeMensual: 0,
    };
    actual.cuentas += 1;
    actual.costeMensual = redondear2(actual.costeMensual + n(cuenta.coste_mensual_eur));
    porTitular.set(id, actual);
  }

  const conRenovacion = activas
    .filter((c) => c.fecha_renovacion)
    .sort((a, b) => String(a.fecha_renovacion).localeCompare(String(b.fecha_renovacion)));

  return {
    costeMensual,
    costeAnual: redondear2(costeMensual * 12),
    activas: activas.length,
    pausadas: cuentas.filter((c) => c.estado === "pausada").length,
    canceladas: cuentas.filter((c) => c.estado === "cancelada").length,
    proxima: conRenovacion[0] ?? null,
    porTitular: [...porTitular.values()].sort((a, b) => b.cuentas - a.cuentas),
    vencidas: conRenovacion.filter((c) => c.vencida),
    proximas: conRenovacion.filter((c) => c.renueva_pronto),
  };
}

/** Las N próximas renovaciones, para la tarjeta del dashboard. */
export async function obtenerProximasRenovaciones(
  limite = 3,
): Promise<CuentaConCoste[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("vw_cuentas_coste")
    .select("*")
    .eq("estado", "activa")
    .not("fecha_renovacion", "is", null)
    .order("fecha_renovacion", { ascending: true })
    .limit(limite);

  if (error || !data) return [];
  return data as unknown as CuentaConCoste[];
}

/** Tipos ya usados, para ofrecerlos en el formulario junto a los estándar. */
export async function obtenerTiposUsados(): Promise<string[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cuentas_activos").select("tipo");
  const tipos = new Set((data ?? []).map((f) => f.tipo).filter(Boolean));
  return [...tipos].sort((a, b) => a.localeCompare(b, "es"));
}

// ── NOTAS ──────────────────────────────────────────────────────────────────

export type FiltrosNotas = {
  q: string;
  etiquetas: string[];
  autor: string;
  archivadas: boolean;
};

export async function obtenerNotas(
  filtros: FiltrosNotas,
): Promise<NotaConAutor[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("notas")
    .select("*, autor:created_by ( nombre, color )")
    .eq("archivada", filtros.archivadas);

  if (filtros.autor !== "todos") consulta = consulta.eq("created_by", filtros.autor);

  // `contains` sobre el array usa el índice GIN: filtra en la base, no aquí.
  if (filtros.etiquetas.length > 0) {
    consulta = consulta.contains("etiquetas", filtros.etiquetas);
  }

  const termino = escaparBusqueda(filtros.q);
  if (termino) {
    consulta = consulta.or(`titulo.ilike.%${termino}%,contenido.ilike.%${termino}%`);
  }

  const { data, error } = await consulta
    // Las fijadas primero, y dentro de cada grupo las más recientes.
    .order("fijada", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map((fila) => {
    const autor = fila.autor as { nombre?: string; color?: string } | null;
    return {
      ...(fila as unknown as NotaConAutor),
      etiquetas: (fila.etiquetas as string[]) ?? [],
      autor_nombre: autor?.nombre ?? "",
      autor_color: autor?.color ?? null,
    };
  });
}

/** Etiquetas existentes con su recuento, para los chips del filtro. */
export async function obtenerEtiquetas(): Promise<{ etiqueta: string; total: number }[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("notas").select("etiquetas").eq("archivada", false);

  const recuento = new Map<string, number>();
  for (const fila of data ?? []) {
    for (const etiqueta of (fila.etiquetas as string[]) ?? []) {
      recuento.set(etiqueta, (recuento.get(etiqueta) ?? 0) + 1);
    }
  }

  return [...recuento.entries()]
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

export async function obtenerNota(id: string): Promise<NotaConAutor | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("notas")
    .select("*, autor:created_by ( nombre, color )")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const fila = data as unknown as Record<string, unknown>;
  const autor = fila.autor as { nombre?: string; color?: string } | null;
  return {
    ...(fila as unknown as NotaConAutor),
    etiquetas: (fila.etiquetas as string[]) ?? [],
    autor_nombre: autor?.nombre ?? "",
    autor_color: autor?.color ?? null,
  };
}
