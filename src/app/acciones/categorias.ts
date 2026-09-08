"use server";

import { revalidatePath } from "next/cache";

import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaCategoria } from "@/lib/esquemas/movimiento";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Server Actions de categorías.
 *
 * Las reglas duras (no borrar las de sistema, no borrar las que tienen
 * movimientos) las impone la base de datos: la política de DELETE exige
 * `es_sistema = false` y la clave foránea bloquea el resto. Aquí se comprueban
 * también antes, para poder dar un mensaje que se entienda en vez de un error
 * de Postgres.
 */

function mensajeDeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("duplicate key")) {
      return "Ya existe una categoría con ese nombre.";
    }
    if (mensaje.includes("violates foreign key")) {
      return "No se puede borrar: tiene movimientos asociados.";
    }
    return mensaje;
  }
  return "Ha ocurrido un error inesperado.";
}

async function exigirSesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, usuario: user };
}

function revalidar() {
  revalidatePath("/categorias");
  revalidatePath("/movimientos");
}

export async function crearCategoria(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaCategoria.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const { nombre, tipo } = validacion.data;

  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre, tipo, es_sistema: false, orden: 500 })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true, datos: { id: (data as { id: string }).id } };
}

/** Renombrar está permitido también en las categorías de sistema. */
export async function renombrarCategoria(
  id: string,
  nombre: string,
): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "Escribe un nombre." };
  if (limpio.length > 60) return { ok: false, error: "El nombre es demasiado largo." };

  const { error } = await supabase
    .from("categorias")
    .update({ nombre: limpio })
    .eq("id", id);

  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

export async function eliminarCategoria(id: string): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data: categoria } = await supabase
    .from("categorias")
    .select("es_sistema")
    .eq("id", id)
    .maybeSingle();

  if (categoria && (categoria as { es_sistema: boolean }).es_sistema) {
    return { ok: false, error: "Las categorías de sistema no se pueden eliminar." };
  }

  const { count } = await supabase
    .from("movimientos")
    .select("id", { count: "exact", head: true })
    .eq("categoria_id", id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `No se puede eliminar: tiene ${count} movimiento${count === 1 ? "" : "s"} asociado${count === 1 ? "" : "s"}.`,
    };
  }

  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

/** Guarda el nuevo orden tras arrastrar. Recibe los ids ya ordenados. */
export async function reordenarCategorias(ids: string[]): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  if (ids.length === 0) return { ok: true };
  if (ids.length > 200) return { ok: false, error: "Demasiadas categorías." };

  const actualizaciones = ids.map((id, indice) =>
    supabase
      .from("categorias")
      .update({ orden: (indice + 1) * 10 })
      .eq("id", id),
  );

  const resultados = await Promise.all(actualizaciones);
  const fallo = resultados.find((resultado) => resultado.error);

  if (fallo?.error) return { ok: false, error: mensajeDeError(fallo.error) };

  revalidar();
  return { ok: true };
}
