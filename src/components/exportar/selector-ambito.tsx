"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTiendas } from "@/components/tiendas/proveedor-tiendas";
import { NOMBRE_GENERAL, SLUG_GENERAL, SLUG_TODAS } from "@/lib/ambito";
import { NOMBRE_CONSOLIDADO, PARAM_AMBITO_GESTORIA } from "@/lib/gestoria/ambito";
import { cn } from "@/lib/utils";

/**
 * Qué parte de la sociedad se exporta: el consolidado (por defecto), una
 * tienda o solo General. Es independiente del selector de tienda de la barra
 * lateral, a propósito: a la gestoría se le manda la sociedad entera salvo que
 * se pida otra cosa. Vive en la URL (`?ambito=`), como el trimestre.
 *
 * Las tiendas archivadas también salen: un trimestre pasado puede tener datos
 * suyos.
 */
export function SelectorAmbitoGestoria({ valor }: { valor: string }) {
  const tiendas = useTiendas();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  function elegir(slug: string) {
    const siguiente = new URLSearchParams(params.toString());
    if (slug === SLUG_TODAS) siguiente.delete(PARAM_AMBITO_GESTORIA);
    else siguiente.set(PARAM_AMBITO_GESTORIA, slug);
    const query = siguiente.toString();
    iniciarTransicion(() =>
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  }

  return (
    <select
      aria-label="Qué parte de la sociedad exportar"
      value={valor}
      disabled={pendiente}
      onChange={(e) => elegir(e.target.value)}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary transition-colors outline-none hover:bg-surface focus-visible:border-brand sm:w-auto sm:min-w-56",
        pendiente && "opacity-60",
      )}
    >
      <option value={SLUG_TODAS}>{NOMBRE_CONSOLIDADO}</option>
      <optgroup label="Una tienda">
        {tiendas.map((t) => (
          <option key={t.id} value={t.slug}>
            {t.nombre}
            {t.estado === "archivada" ? " (archivada)" : ""}
          </option>
        ))}
      </optgroup>
      <option value={SLUG_GENERAL}>{NOMBRE_GENERAL} (solo gastos compartidos)</option>
    </select>
  );
}
