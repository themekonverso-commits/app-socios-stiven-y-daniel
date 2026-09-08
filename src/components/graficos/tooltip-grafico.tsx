"use client";

import { formatearEuros, formatearEntero } from "@/lib/formato";

export type FilaTooltip = {
  nombre: string;
  valor: number | null;
  color: string;
  /** Los pedidos no son dinero: se pintan como entero, sin el símbolo €. */
  formato?: "euros" | "entero";
};

/**
 * Tooltip común: fondo --bg-surface-2, borde de 1px, radio 10px y los importes
 * en formato español. Se comparte para que todos los gráficos hablen igual.
 */
export function TooltipGrafico({
  titulo,
  filas,
}: {
  titulo: string;
  filas: FilaTooltip[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 shadow-none">
      <p className="mb-1.5 text-xs font-medium text-text-primary">{titulo}</p>
      <ul className="flex flex-col gap-1">
        {filas.map((fila) => (
          <li key={fila.nombre} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              style={{ backgroundColor: fila.color }}
              className="size-2 shrink-0 rounded-full"
            />
            <span className="text-text-secondary">{fila.nombre}</span>
            <span className="cifra ml-auto font-medium text-text-primary">
              {fila.valor === null
                ? "—"
                : fila.formato === "entero"
                  ? formatearEntero(fila.valor)
                  : formatearEuros(fila.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
