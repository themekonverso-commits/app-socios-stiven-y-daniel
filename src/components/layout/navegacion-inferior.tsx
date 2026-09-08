"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAVEGACION_MOVIL, esRutaActiva } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

/**
 * Barra inferior de móvil con los cuatro destinos principales. Se oculta a
 * partir de 768px, donde manda la sidebar.
 */
export function NavegacionInferior() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación rápida"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4 gap-1 px-2 py-1.5">
        {NAVEGACION_MOVIL.map((enlace) => {
          const activo = esRutaActiva(enlace.href, pathname);
          const Icono = enlace.icono;

          return (
            <li key={enlace.href}>
              <Link
                href={enlace.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                  activo
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icono
                  aria-hidden="true"
                  className={cn("size-5", activo && "text-brand")}
                />
                <span className="truncate">{enlace.titulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
