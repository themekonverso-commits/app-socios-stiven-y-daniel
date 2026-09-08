"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { NAVEGACION, esRutaActiva } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

/**
 * Navegación de la sidebar. Es la misma en escritorio y dentro del drawer
 * móvil: un solo sitio donde mantener los enlaces y el estado activo.
 */
export function NavegacionSidebar({
  alNavegar,
}: {
  /** El drawer móvil lo usa para cerrarse al pulsar un enlace. */
  alNavegar?: () => void;
}) {
  const pathname = usePathname();
  const [consulta, setConsulta] = useState("");

  const grupos = useMemo(() => {
    const termino = consulta.trim().toLowerCase();
    if (!termino) return NAVEGACION;

    return NAVEGACION.map((grupo) => ({
      ...grupo,
      enlaces: grupo.enlaces.filter((enlace) =>
        enlace.titulo.toLowerCase().includes(termino),
      ),
    })).filter((grupo) => grupo.enlaces.length > 0);
  }, [consulta]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative">
        <label htmlFor="buscador-menu" className="sr-only">
          Buscar en el menú
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        />
        <input
          id="buscador-menu"
          type="search"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder="Buscar en el menú"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand"
        />
      </div>

      <nav aria-label="Navegación principal" className="min-h-0 flex-1 overflow-y-auto">
        {grupos.length === 0 ? (
          <p className="px-3 py-2 text-sm text-text-muted">
            Ningún apartado coincide con «{consulta}».
          </p>
        ) : null}

        {grupos.map((grupo, indice) => (
          <div key={grupo.titulo ?? `grupo-${indice}`} className={indice > 0 ? "mt-5" : ""}>
            {grupo.titulo ? (
              <h2 className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
                {grupo.titulo}
              </h2>
            ) : null}

            <ul className="flex flex-col gap-1">
              {grupo.enlaces.map((enlace) => {
                const activo = esRutaActiva(enlace.href, pathname);
                const Icono = enlace.icono;

                return (
                  <li key={enlace.href}>
                    <Link
                      href={enlace.href}
                      onClick={alNavegar}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        // 44px de alto: objetivo táctil mínimo también aquí.
                        "relative flex min-h-11 items-center gap-3 rounded-lg py-2 pr-3 pl-3.5 text-sm transition-colors",
                        activo
                          ? "bg-surface-2 font-medium text-text-primary"
                          : "text-text-secondary hover:bg-surface hover:text-text-primary",
                      )}
                    >
                      {/* Barra de 3px en naranja a la izquierda de la ruta activa. */}
                      {activo ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                        />
                      ) : null}
                      <Icono aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{enlace.titulo}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
