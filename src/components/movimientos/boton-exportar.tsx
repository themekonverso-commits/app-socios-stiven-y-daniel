"use client";

import { Download } from "lucide-react";

import { useAmbito } from "@/components/tiendas/proveedor-tiendas";
import { conTienda } from "@/lib/ambito";
import { escribirFiltros, type Filtros } from "@/lib/esquemas/filtros";

/**
 * Descarga los movimientos FILTRADOS en CSV.
 *
 * Es un enlace normal a un route handler: el navegador se encarga de la
 * descarga y los mismos filtros de la vista viajan en la query string, así que
 * lo que se baja es exactamente lo que se está viendo. La tienda también: va
 * explícita en el enlace, no se confía en la cookie.
 */
export function BotonExportar({ filtros }: { filtros: Filtros }) {
  const { slug } = useAmbito();
  const query = escribirFiltros({ ...filtros, pagina: 1 });
  const href = conTienda(
    query ? `/api/movimientos/exportar?${query}` : "/api/movimientos/exportar",
    slug,
  );

  return (
    <a
      href={href}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
    >
      <Download aria-hidden="true" className="size-4" />
      Exportar CSV
    </a>
  );
}
