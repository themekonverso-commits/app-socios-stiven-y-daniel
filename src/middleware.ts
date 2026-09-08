import type { NextRequest } from "next/server";

import { actualizarSesion } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /**
     * Todas las rutas salvo los estáticos de Next, el favicon y las imágenes.
     * La protección de /login se decide dentro de actualizarSesion().
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
