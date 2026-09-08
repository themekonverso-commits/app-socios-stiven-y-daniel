"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Guion en lugar de una variación inventada.
 *
 * Cuando el periodo anterior no tiene datos no existe un porcentaje válido:
 * enseñar «+100 %» sería mentir, y «0 %» también. Se pinta un guion y el
 * tooltip explica por qué.
 */
export function SinHistorico({
  motivo = "No hay datos del periodo anterior con los que comparar.",
  claro = false,
}: {
  motivo?: string;
  claro?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="note"
          aria-label={motivo}
          className={
            claro
              ? "cursor-help text-white/90 underline decoration-dotted underline-offset-4"
              : "cursor-help text-text-muted underline decoration-dotted underline-offset-4"
          }
        >
          —
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{motivo}</TooltipContent>
    </Tooltip>
  );
}
