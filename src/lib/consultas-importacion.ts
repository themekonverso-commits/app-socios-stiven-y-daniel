import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";

export type Importacion = {
  id: string;
  nombre_archivo: string;
  origen: string | null;
  filas_totales: number;
  filas_importadas: number;
  filas_omitidas: number;
  importe_total_eur: number;
  created_at: string | null;
  autor: string;
  bloqueada: boolean;
  motivo_bloqueo: string | null;
};

export type MapeoGuardado = {
  id: string;
  nombre: string;
  origen: string | null;
  config: Record<string, unknown>;
};

/**
 * Historial de importaciones, cada una con si se puede deshacer o no.
 *
 * El bloqueo lo decide `fn_importacion_bloqueada` en Postgres: si alguno de sus
 * movimientos ya entró en un cierre aprobado o en un reembolso, deshacerla
 * descuadraría números dados por buenos.
 */
export async function obtenerImportaciones(): Promise<Importacion[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("importaciones")
    .select("*, autor:created_by ( nombre )")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const filas = data as unknown as Record<string, unknown>[];

  const conEstado = await Promise.all(
    filas.map(async (fila) => {
      const { data: estado } = await supabase.rpc("fn_importacion_bloqueada", {
        p_importacion: String(fila.id),
      });

      const info = (estado ?? {}) as { bloqueada?: boolean; motivo?: string };
      const autor = fila.autor as { nombre?: string } | null;

      return {
        id: String(fila.id),
        nombre_archivo: String(fila.nombre_archivo ?? ""),
        origen: (fila.origen as string) ?? null,
        filas_totales: Number(fila.filas_totales ?? 0),
        filas_importadas: Number(fila.filas_importadas ?? 0),
        filas_omitidas: Number(fila.filas_omitidas ?? 0),
        importe_total_eur: Number(fila.importe_total_eur ?? 0),
        created_at: (fila.created_at as string) ?? null,
        autor: autor?.nombre ?? "",
        bloqueada: Boolean(info.bloqueada),
        motivo_bloqueo: info.motivo ?? null,
      };
    }),
  );

  return conEstado;
}

export async function obtenerMapeos(): Promise<MapeoGuardado[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("mapeos_importacion")
    .select("id, nombre, origen, config")
    .order("nombre", { ascending: true });

  if (error || !data) return [];

  return data.map((fila) => ({
    id: String(fila.id),
    nombre: String(fila.nombre),
    origen: fila.origen ?? null,
    config: (fila.config ?? {}) as Record<string, unknown>,
  }));
}
