"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { MenuUsuario, type UsuarioSidebar } from "@/components/layout/menu-usuario";
import { NavegacionSidebar } from "@/components/layout/navegacion-sidebar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TODOS_LOS_ENLACES, esRutaActiva } from "@/lib/navegacion";

/**
 * Barra superior de móvil: botón hamburguesa que abre la sidebar como drawer,
 * más el título de la pantalla actual. En escritorio desaparece porque la
 * sidebar ya está siempre visible.
 */
export function BarraSuperior({ usuario }: { usuario: UsuarioSidebar }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  const enlaceActual = TODOS_LOS_ENLACES.find((enlace) =>
    esRutaActiva(enlace.href, pathname),
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-base/95 px-4 backdrop-blur md:hidden">
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú de navegación"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-primary transition-colors hover:bg-surface-2"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </SheetTrigger>

        <SheetContent
          side="left"
          className="flex w-[280px] flex-col gap-0 border-border bg-base p-0"
        >
          <SheetHeader className="h-16 shrink-0 justify-center px-4">
            <SheetTitle asChild>
              <span>
                <Logo />
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Navegación principal del dashboard
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
            <NavegacionSidebar alNavegar={() => setAbierto(false)} />
            <div className="mt-4 shrink-0">
              <MenuUsuario usuario={usuario} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <span className="truncate text-base font-semibold text-text-primary">
        {enlaceActual?.titulo ?? "Dashboard"}
      </span>
    </header>
  );
}
