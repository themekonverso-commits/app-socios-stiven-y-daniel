import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { escribirFiltros, FILAS_POR_PAGINA, type Filtros } from "@/lib/esquemas/filtros";
import { formatearEntero } from "@/lib/formato";

/** Paginación en servidor: cada página es una URL de verdad. */
export function Paginacion({
  filtros,
  total,
  paginas,
}: {
  filtros: Filtros;
  total: number;
  paginas: number;
}) {
  if (total === 0) return null;

  const desde = (filtros.pagina - 1) * FILAS_POR_PAGINA + 1;
  const hasta = Math.min(filtros.pagina * FILAS_POR_PAGINA, total);

  const enlace = (pagina: number) => {
    const query = escribirFiltros({ ...filtros, pagina });
    return query ? `/movimientos?${query}` : "/movimientos";
  };

  const claseBoton =
    "flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors";

  return (
    <nav
      aria-label="Paginación de movimientos"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="cifra text-sm text-text-secondary">
        {formatearEntero(desde)}–{formatearEntero(hasta)} de{" "}
        {formatearEntero(total)} movimiento{total === 1 ? "" : "s"}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          {filtros.pagina > 1 ? (
            <Link
              href={enlace(filtros.pagina - 1)}
              scroll={false}
              rel="prev"
              className={cn(claseBoton, "text-text-primary hover:bg-surface-2")}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </Link>
          ) : (
            <span className={cn(claseBoton, "text-text-muted opacity-50")}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </span>
          )}

          <span className="cifra px-1 text-sm text-text-secondary">
            {filtros.pagina} / {paginas}
          </span>

          {filtros.pagina < paginas ? (
            <Link
              href={enlace(filtros.pagina + 1)}
              scroll={false}
              rel="next"
              className={cn(claseBoton, "text-text-primary hover:bg-surface-2")}
            >
              Siguiente
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className={cn(claseBoton, "text-text-muted opacity-50")}>
              Siguiente
              <ChevronRight aria-hidden="true" className="size-4" />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
