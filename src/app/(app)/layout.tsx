import { redirect } from "next/navigation";

import { BarraSuperior } from "@/components/layout/barra-superior";
import { NavegacionInferior } from "@/components/layout/navegacion-inferior";
import { Sidebar } from "@/components/layout/sidebar";
import type { UsuarioSidebar } from "@/components/layout/menu-usuario";
import { ProveedorMovimientos } from "@/components/movimientos/proveedor-movimientos";
import {
  obtenerCategorias,
  obtenerConceptosFrecuentes,
  obtenerSocios,
  obtenerUltimaTasa,
} from "@/lib/consultas";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Estructura de la aplicación autenticada.
 *
 * El middleware ya bloquea el acceso sin sesión; esta comprobación es la
 * segunda cerradura, la que de verdad protege los datos si algún día el
 * matcher del middleware deja un hueco.
 */
export default async function LayoutAplicacion({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, email, color, activo")
    .eq("id", user.id)
    .maybeSingle();

  const usuario: UsuarioSidebar = {
    nombre: perfil?.nombre ?? user.email?.split("@")[0] ?? "Socio",
    email: perfil?.email ?? user.email ?? "",
    color: perfil?.color ?? "#F2551E",
  };

  // Datos de referencia del formulario de movimiento. Se cargan aquí, una sola
  // vez, para que el botón «+ Nuevo movimiento» funcione desde cualquier
  // pantalla sin volver a pedirlos.
  const [categorias, socios, conceptos, ultimaTasa] = await Promise.all([
    obtenerCategorias(),
    obtenerSocios(),
    obtenerConceptosFrecuentes(),
    obtenerUltimaTasa(),
  ]);

  return (
    <ProveedorMovimientos
      categorias={categorias}
      socios={socios}
      conceptos={conceptos}
      usuarioId={user.id}
      ultimaTasa={ultimaTasa}
    >
      <div className="min-h-dvh bg-base">
      <a href="#contenido-principal" className="skip-link">
        Saltar al contenido principal
      </a>

      <Sidebar usuario={usuario} />
      <BarraSuperior usuario={usuario} />

      {/* En escritorio el contenido deja hueco a la sidebar fija de 248px. */}
      <div className="md:pl-sidebar">
        <main
          id="contenido-principal"
          tabIndex={-1}
          // 16px en móvil, 32px en escritorio. El padding inferior extra deja
          // sitio a la barra de navegación inferior.
          className="mx-auto w-full max-w-[1400px] p-4 pb-28 md:p-8 md:pb-8"
        >
          {children}
        </main>
      </div>

      <NavegacionInferior />
      </div>
    </ProveedorMovimientos>
  );
}
