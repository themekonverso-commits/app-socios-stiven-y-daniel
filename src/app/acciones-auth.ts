"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoAuth = { error: string };

/**
 * Inicia sesión con email y contraseña.
 *
 * Devuelve un error legible en español, o redirige. Los mensajes de Supabase
 * vienen en inglés y filtran detalles, así que se traducen a un texto único
 * que no revela si el email existe.
 */
export async function iniciarSesion(datos: {
  email: string;
  password: string;
  redirigir?: string;
}): Promise<ResultadoAuth | undefined> {
  const supabase = await crearClienteServidor();

  const { error } = await supabase.auth.signInWithPassword({
    email: datos.email.trim(),
    password: datos.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return {
        error:
          "La cuenta todavía no está confirmada. Confírmala desde el panel de Supabase.",
      };
    }
    return { error: "Email o contraseña incorrectos." };
  }

  // Solo se acepta una ruta interna: evita redirecciones abiertas a otro sitio.
  const destino =
    datos.redirigir && datos.redirigir.startsWith("/") && !datos.redirigir.startsWith("//")
      ? datos.redirigir
      : "/";

  revalidatePath("/", "layout");
  redirect(destino);
}

/** Cierra la sesión y devuelve al login. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
