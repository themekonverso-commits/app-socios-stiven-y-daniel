import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import { redondear2 } from "@/lib/dinero";
import { filtrarPorAmbito, type Ambito } from "@/lib/ambito";
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
 *
 * Multi-tienda (0018): cuentas y notas tienen `tienda_id` (NULL = General /
 * Sociedad). Toda lectura por tienda recibe el ámbito como ÚLTIMO parámetro
 * opcional: sin él no filtra (todas, cada una con su tienda).
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
  ambito?: Ambito,
): Promise<CuentaConCoste[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("vw_cuentas_coste").select("*");
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);

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

/**
 * Las cuentas sin los filtros de la barra: el resumen es del ámbito entero
 * (la tienda, General o todas), no de lo que se esté buscando.
 */
export async function obtenerResumenCuentas(ambito?: Ambito): Promise<ResumenCuentas> {
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("vw_cuentas_coste").select("*");
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);
  const { data, error } = await consulta;

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
  ambito?: Ambito,
): Promise<CuentaConCoste[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("vw_cuentas_coste")
    .select("*")
    .eq("estado", "activa")
    .not("fecha_renovacion", "is", null);
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);

  const { data, error } = await consulta
    .order("fecha_renovacion", { ascending: true })
    .limit(limite);

  if (error || !data) return [];
  return data as unknown as CuentaConCoste[];
}

/**
 * Tipos ya usados, para ofrecerlos en el formulario junto a los estándar. De
 * todas las tiendas a propósito: son sugerencias, no datos.
 */
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
  ambito?: Ambito,
): Promise<NotaConAutor[]> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("notas")
    .select("*, autor:created_by ( nombre, color )")
    .eq("archivada", filtros.archivadas);
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);

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

/** Etiquetas de las notas del ámbito con su recuento, para los chips del filtro. */
export async function obtenerEtiquetas(
  ambito?: Ambito,
): Promise<{ etiqueta: string; total: number }[]> {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("notas").select("etiquetas").eq("archivada", false);
  if (ambito) consulta = filtrarPorAmbito(consulta, ambito);
  const { data } = await consulta;

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
