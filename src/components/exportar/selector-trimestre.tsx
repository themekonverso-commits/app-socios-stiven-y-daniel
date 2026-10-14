"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Selector de trimestre. El valor vive en la URL (`?trimestre=2026-Q3`) para
 * que la página se pueda compartir y recargar sin perder el periodo. Cambiarlo
 * conserva el resto de la query (el ámbito, la tienda).
 */
export function SelectorTrimestre({
  opciones,
  valor,
}: {
  opciones: { clave: string; etiqueta: string; enCurso: boolean }[];
  valor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  function elegir(clave: string) {
    const siguiente = new URLSearchParams(params.toString());
    siguiente.set("trimestre", clave);
    iniciarTransicion(() =>
      router.push(`${pathname}?${siguiente.toString()}`, { scroll: false }),
    );
  }

  return (
    <select
      aria-label="Trimestre a exportar"
      value={valor}
      disabled={pendiente}
      onChange={(e) => elegir(e.target.value)}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary transition-colors outline-none hover:bg-surface focus-visible:border-brand sm:w-auto sm:min-w-56",
        pendiente && "opacity-60",
      )}
    >
      {opciones.map((o) => (
        <option key={o.clave} value={o.clave}>
          {o.etiqueta}
          {o.enCurso ? " (en curso, sin cerrar)" : ""}
        </option>
      ))}
    </select>
  );
}
