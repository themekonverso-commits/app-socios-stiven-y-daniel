"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaNota } from "@/lib/esquemas/cuentas";
import type { Resultado } from "@/app/acciones/movimientos";

/** Server Actions del bloc de notas compartido entre los dos socios. */

const UUID = z.uuid();

function revalidar() {
  revalidatePath("/notas");
}

function mensaje(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ha ocurrido un error inesperado.";
}

/** Etiquetas sin duplicados, sin vacíos y con un orden estable. */
function limpiarEtiquetas(etiquetas: string[]): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const bruta of etiquetas) {
    const etiqueta = bruta.trim();
    if (!etiqueta) continue;
    const clave = etiqueta.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push(etiqueta);
  }
  return resultado;
}

export async function crearNota(): Promise<Resultado<{ id: string }>> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  // Se crea vacía y se guarda sola mientras se escribe: es lo que espera
  // cualquiera que abre un bloc de notas.
  const { data, error } = await supabase
    .from("notas")
    .insert({ titulo: "", contenido: "", etiquetas: [], created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true, datos: { id: String(data.id) } };
}

export async function guardarNota(
  id: string,
  entrada: unknown,
): Promise<Resultado<{ actualizada: string }>> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const validacion = esquemaNota.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const datos = validacion.data;
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("notas")
    .update({
      titulo: datos.titulo,
      contenido: datos.contenido ?? "",
      etiquetas: limpiarEtiquetas(datos.etiquetas),
      color: datos.color ?? null,
      fijada: datos.fijada,
      archivada: datos.archivada,
    })
    .eq("id", id)
    .select("updated_at")
    .single();

  if (error) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true, datos: { actualizada: String(data?.updated_at ?? "") } };
}

export async function alternarFijada(id: string, fijada: boolean): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("notas").update({ fijada }).eq("id", id);

  if (error) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true };
}

export async function alternarArchivada(
  id: string,
  archivada: boolean,
): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("notas")
    // Archivar y seguir fijada arriba es contradictorio.
    .update({ archivada, fijada: archivada ? false : undefined })
    .eq("id", id);

  if (error) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true };
}

export async function eliminarNota(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("notas").delete().eq("id", id);

  if (error) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true };
}
