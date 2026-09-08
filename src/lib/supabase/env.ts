/**
 * Variables de entorno públicas de Supabase.
 *
 * Solo URL y clave anónima. La SUPABASE_SERVICE_ROLE_KEY no se lee nunca desde
 * aquí: es una clave de servidor y debe usarse exclusivamente dentro de Server
 * Actions o route handlers. Si aparece en un componente "use client", es un bug
 * crítico de seguridad.
 */
export function obtenerEntornoSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las variables de entorno de Supabase. Copia .env.local.example " +
        "a .env.local y rellena NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}
