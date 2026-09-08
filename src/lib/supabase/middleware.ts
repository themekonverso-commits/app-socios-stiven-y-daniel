import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { obtenerEntornoSupabase } from "./env";

/** Rutas accesibles sin sesión. Todo lo demás queda protegido. */
const RUTAS_PUBLICAS = ["/login"];

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

/**
 * Refresca la sesión en cada petición y protege todas las rutas salvo /login.
 *
 * El orden importa: hay que devolver SIEMPRE la respuesta que lleva las cookies
 * actualizadas, o el token de refresco se pierde y la sesión se cae sola.
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = obtenerEntornoSupabase();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida el token contra Supabase. No usar getSession() aquí: lee
  // la cookie sin verificarla y es falsificable.
  //
  // Si Supabase no responde se falla CERRADO: se trata como sesión inexistente
  // y el usuario acaba en /login. Nunca al revés.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  if (!user && !esRutaPublica(pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    // Se recuerda a dónde iba para devolverlo ahí tras iniciar sesión.
    if (pathname !== "/") {
      destino.searchParams.set("redirigir", pathname);
    }
    return NextResponse.redirect(destino);
  }

  if (user && pathname === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return response;
}
