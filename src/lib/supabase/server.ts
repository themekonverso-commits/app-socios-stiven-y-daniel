import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { obtenerEntornoSupabase } from "./env";

/**
 * Cliente de Supabase para Server Components, Server Actions y route handlers.
 *
 * Se lee la cookie ANTES que el entorno a propósito: `cookies()` marca el
 * render como dinámico, de modo que este cliente nunca se ejecuta durante
 * `next build`.
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();
  const { url, anonKey } = obtenerEntornoSupabase();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: las cookies las refresca el
          // middleware, así que se puede ignorar sin consecuencias.
        }
      },
    },
  });
}
