"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { obtenerEntornoSupabase } from "./env";

/** Cliente de Supabase para componentes de navegador. */
export function crearClienteNavegador() {
  const { url, anonKey } = obtenerEntornoSupabase();
  return createBrowserClient<Database>(url, anonKey);
}
