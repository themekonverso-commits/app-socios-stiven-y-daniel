"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { SLUG_GENERAL, SLUG_TODAS, slugDeNombre } from "@/lib/ambito";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Alta, edición y archivo de tiendas. Las tiendas son de la sociedad: las
 * puede editar, pausar o archivar cualquiera de los dos socios. Borrar solo
 * se puede una tienda vacía (lo impiden las FK de la migración 0018).
 */

const UUID = z.uuid();

const esquemaTienda = z.object({
  nombre: z.string().trim().min(1, "Pon un nombre a la tienda.").max(60, "Máximo 60 caracteres."),
  url_shopify: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v), {
      message: "La URL no parece válida.",
    })
    .nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Elige un color."),
  fecha_lanzamiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  objetivo_facturacion: z.number().min(0).max(100_000_000).default(0),
  objetivo_beneficio: z.number().min(-100_000_000).max(100_000_000).default(0),
  notas: z.string().trim().max(2000).nullable().default(null),
});

export type DatosTienda = z.input<typeof esquemaTienda>;

function revalidar() {
  // El selector vive en el layout: hay que refrescarlo entero.
  revalidatePath("/", "layout");
}

function mensaje(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string };
    if (e.code === "23505") return "Ya hay una tienda con ese nombre.";
    if (e.code === "23503")
      return "La tienda tiene movimientos, cobros, importaciones, cuentas o notas: no se puede borrar. Archívala.";
    if (e.message) return e.message;
  }
  return "Ha ocurrido un error inesperado.";
}

/** Un slug libre a partir del nombre: «mi-tienda», «mi-tienda-2»… */
async function slugLibre(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  nombre: string,
  excluirId?: string,
): Promise<string> {
  let base = slugDeNombre(nombre) || "tienda";
  if (base === SLUG_TODAS || base === SLUG_GENERAL) base = `tienda-${base}`;

  const { data } = await supabase.from("tiendas").select("id, slug").like("slug", `${base}%`);
  const usados = new Set((data ?? []).filter((t) => t.id !== excluirId).map((t) => t.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    if (!usados.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export async function crearTienda(
  datos: DatosTienda,
): Promise<Resultado<{ id: string; slug: string }>> {
  const parseado = esquemaTienda.safeParse(datos);
  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parseado.data;

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const slug = await slugLibre(supabase, d.nombre);

  const { data, error } = await supabase
    .from("tiendas")
    .insert({
      nombre: d.nombre,
      slug,
      url_shopify: d.url_shopify,
      color: d.color,
      fecha_lanzamiento: d.fecha_lanzamiento,
      objetivo_mes: { facturacion: d.objetivo_facturacion, beneficio: d.objetivo_beneficio },
      notas: d.notas,
      created_by: user.id,
    })
    .select("id, slug")
    .single();

  if (error || !data) return { ok: false, error: mensaje(error) };

  revalidar();
  return { ok: true, datos: data };
}

export async function editarTienda(
  id: string,
  datos: DatosTienda,
): Promise<Resultado<{ slug: string }>> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Tienda no válida." };
  const parseado = esquemaTienda.safeParse(datos);
  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parseado.data;

  const supabase = await crearClienteServidor();

  // El slug no cambia al renombrar: así los enlaces compartidos siguen valiendo.
  const { data, error } = await supabase
    .from("tiendas")
    .update({
      nombre: d.nombre,
      url_shopify: d.url_shopify,
      color: d.color,
      fecha_lanzamiento: d.fecha_lanzamiento,
      objetivo_mes: { facturacion: d.objetivo_facturacion, beneficio: d.objetivo_beneficio },
      notas: d.notas,
    })
    .eq("id", id)
    .select("slug");

  if (error) return { ok: false, error: mensaje(error) };
  if (!data || data.length === 0) return { ok: false, error: "No se encontró la tienda." };

  revalidar();
  return { ok: true, datos: { slug: data[0].slug } };
}

export async function cambiarEstadoTienda(
  id: string,
  estado: "activa" | "pausada" | "archivada",
): Promise<Resultado<null>> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Tienda no válida." };
  if (!["activa", "pausada", "archivada"].includes(estado)) {
    return { ok: false, error: "Estado no válido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("tiendas")
    .update({ estado })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: mensaje(error) };
  if (!data || data.length === 0) return { ok: false, error: "No se encontró la tienda." };

  revalidar();
  return { ok: true, datos: null };
}

/** Solo una tienda vacía, y solo quien la creó. Si tiene datos, la FK lo impide. */
export async function borrarTienda(id: string): Promise<Resultado<null>> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Tienda no válida." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("tiendas").delete().eq("id", id).select("id");

  if (error) return { ok: false, error: mensaje(error) };
  if (!data || data.length === 0) {
    return { ok: false, error: "Solo quien creó la tienda puede borrarla." };
  }

  revalidar();
  return { ok: true, datos: null };
}
