"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Server Actions de la liquidación.
 *
 * Son deliberadamente finas: validan la forma de los datos y llaman a la
 * función SQL correspondiente. Ni un solo importe se calcula aquí, y ninguna
 * de estas acciones decide quién puede firmar un cierre: eso lo resuelve
 * Postgres con auth.uid().
 */

const UUID = z.uuid();
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");

function traducirError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ha ocurrido un error inesperado.";
}

function revalidar() {
  revalidatePath("/liquidacion");
  revalidatePath("/liquidacion/cierres");
  revalidatePath("/movimientos");
  revalidatePath("/kpis");
  revalidatePath("/");
}

const esquemaReembolso = z.object({
  socio_id: UUID,
  fecha: FECHA,
  importe: z
    .number({ error: "Escribe el importe." })
    .finite()
    .gt(0, "El importe tiene que ser mayor que cero."),
  metodo: z.enum(["transferencia", "efectivo", "compensación"]).nullable().optional(),
  notas: z.string().trim().max(500).nullable().optional(),
  lineas: z
    .array(
      z.object({
        movimiento_id: UUID,
        importe_eur: z.number().finite().gt(0),
      }),
    )
    .min(1, "Selecciona al menos un anticipo."),
});

export async function registrarReembolso(
  entrada: unknown,
): Promise<Resultado<{ id: string }>> {
  const validacion = esquemaReembolso.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const datos = validacion.data;
  const supabase = await crearClienteServidor();

  // Una sola llamada = una sola transacción. Si una línea rebota por superar
  // lo pendiente, no queda ni la cabecera.
  const { data, error } = await supabase.rpc("fn_registrar_reembolso", {
    p_socio_id: datos.socio_id,
    p_fecha: datos.fecha,
    p_importe: datos.importe,
    p_metodo: datos.metodo ?? undefined,
    p_notas: datos.notas ?? undefined,
    p_lineas: datos.lineas,
  });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true, datos: { id: String(data) } };
}

export async function anularReembolso(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) {
    return { ok: false, error: "Identificador no válido." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("fn_anular_reembolso", { p_reembolso: id });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true };
}

/** Cifras de un cierre sin guardarlo, para el asistente. */
export async function previsualizarCierre(
  inicio: string,
  fin: string,
  pctReinversion: number,
): Promise<Resultado<Record<string, unknown>>> {
  if (!FECHA.safeParse(inicio).success || !FECHA.safeParse(fin).success) {
    return { ok: false, error: "El periodo no es válido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_previsualizar_cierre", {
    p_inicio: inicio,
    p_fin: fin,
    p_pct_reinversion: pctReinversion,
  });

  if (error) return { ok: false, error: traducirError(error) };
  return { ok: true, datos: data as unknown as Record<string, unknown> };
}

const esquemaCierre = z.object({
  etiqueta: z.string().trim().min(1, "Ponle una etiqueta al cierre.").max(60),
  inicio: FECHA,
  fin: FECHA,
  pct_reinversion: z.number().min(0).max(100),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export async function crearCierre(
  entrada: unknown,
): Promise<Resultado<{ id: string }>> {
  const validacion = esquemaCierre.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const datos = validacion.data;
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("fn_crear_cierre", {
    p_etiqueta: datos.etiqueta,
    p_inicio: datos.inicio,
    p_fin: datos.fin,
    p_pct_reinversion: datos.pct_reinversion,
    p_notas: datos.notas ?? undefined,
  });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true, datos: { id: String(data) } };
}

/**
 * Firma del cierre.
 *
 * Fíjate en que NO recibe el id del socio: quién firma lo decide auth.uid()
 * dentro de la base de datos. Ocultar el botón del otro socio en la interfaz
 * es cortesía; esto es la cerradura.
 */
export async function aprobarCierre(
  cierreId: string,
): Promise<Resultado<{ estado: string; firmas: number; socios: number }>> {
  if (!UUID.safeParse(cierreId).success) {
    return { ok: false, error: "Identificador no válido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_aprobar_cierre", {
    p_cierre: cierreId,
  });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  const resultado = data as unknown as {
    estado: string;
    firmas: number;
    socios: number;
  };
  return { ok: true, datos: resultado };
}

export async function retirarAprobacion(cierreId: string): Promise<Resultado> {
  if (!UUID.safeParse(cierreId).success) {
    return { ok: false, error: "Identificador no válido." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("fn_retirar_aprobacion", {
    p_cierre: cierreId,
  });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true };
}

export async function eliminarCierre(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) {
    return { ok: false, error: "Identificador no válido." };
  }

  const supabase = await crearClienteServidor();
  // La política de RLS y el trigger impiden borrar uno aprobado.
  const { error } = await supabase.from("cierres").delete().eq("id", id);

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true };
}
