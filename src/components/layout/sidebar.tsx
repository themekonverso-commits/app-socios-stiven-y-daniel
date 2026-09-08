import { Logo } from "@/components/layout/logo";
import { MenuUsuario, type UsuarioSidebar } from "@/components/layout/menu-usuario";
import { NavegacionSidebar } from "@/components/layout/navegacion-sidebar";

/**
 * Sidebar fija de 248px. Solo en escritorio (>=768px); por debajo se sustituye
 * por el drawer de la barra superior más la navegación inferior.
 */
export function Sidebar({ usuario }: { usuario: UsuarioSidebar }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-sidebar shrink-0 border-r border-border bg-base md:flex md:flex-col">
      <div className="flex h-16 shrink-0 items-center px-4">
        <Logo />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        <NavegacionSidebar />
        <div className="mt-4 shrink-0">
          <MenuUsuario usuario={usuario} />
        </div>
      </div>
    </aside>
  );
}
