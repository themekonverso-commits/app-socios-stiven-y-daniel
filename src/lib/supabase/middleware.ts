import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { COOKIE_TIENDA, PARAM_TIENDA, esSlugValido } from "@/lib/ambito";

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
  // Tienda activa. Si la URL trae ?tienda=, manda y se guarda en la cookie.
  // Se escribe también en la petición para que la página, en esta misma
  // respuesta, ya lea la tienda nueva.
  const paramTienda = request.nextUrl.searchParams.get(PARAM_TIENDA);
  const cookieTienda = request.cookies.get(COOKIE_TIENDA)?.value;
  const tiendaNueva =
    esSlugValido(paramTienda) && paramTienda !== cookieTienda ? paramTienda : null;
  if (tiendaNueva) {
    request.cookies.set(COOKIE_TIENDA, tiendaNueva);
  }

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

  // Sin ?tienda= en la URL pero con una tienda recordada: se añade a la URL,
  // para que lo que se copie o comparta abra siempre la tienda correcta. Solo
  // en navegaciones (GET): ni en las Server Actions ni en /api.
  if (
    user &&
    !paramTienda &&
    esSlugValido(cookieTienda) &&
    request.method === "GET" &&
    !pathname.startsWith("/api/")
  ) {
    const destino = request.nextUrl.clone();
    destino.searchParams.set(PARAM_TIENDA, cookieTienda);
    const redireccion = NextResponse.redirect(destino);
    // Sin perder las cookies de sesión que haya refrescado Supabase.
    for (const cookie of response.cookies.getAll()) {
      redireccion.cookies.set(cookie);
    }
    return redireccion;
  }

  if (tiendaNueva) {
    response.cookies.set(COOKIE_TIENDA, tiendaNueva, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
