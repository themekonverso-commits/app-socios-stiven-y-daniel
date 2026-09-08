import { ChartColumn } from "lucide-react";

import { ALTURA_MINIMA } from "@/components/graficos/tema";

/**
 * Estado vacío de un gráfico. Un lienzo en blanco parece un error de carga;
 * esto dice explícitamente que no hay datos en el periodo.
 */
export function GraficoVacio({
  mensaje = "No hay datos en este periodo.",
  sugerencia,
}: {
  mensaje?: string;
  sugerencia?: string;
}) {
  return (
    <div
      style={{ minHeight: ALTURA_MINIMA }}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center"
    >
      <ChartColumn aria-hidden="true" className="size-6 text-text-muted" />
      <p className="text-sm text-text-secondary">{mensaje}</p>
      {sugerencia ? (
        <p className="text-xs text-text-muted">{sugerencia}</p>
      ) : null}
    </div>
  );
}
