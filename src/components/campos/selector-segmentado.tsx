"use client";

import { cn } from "@/lib/utils";

export type OpcionSegmentada<T extends string> = {
  valor: T;
  etiqueta: string;
  /** Color del punto que acompaña a la etiqueta, si lo lleva. */
  color?: string | null;
};

/**
 * Selector segmentado accesible.
 *
 * Es un grupo de radios de verdad, no botones: así funciona con teclado
 * (flechas), lo anuncian los lectores de pantalla y el estado seleccionado no
 * depende solo del color.
 */
export function SelectorSegmentado<T extends string>({
  nombre,
  valor,
  opciones,
  alCambiar,
  etiquetaGrupo,
  className,
  deshabilitado,
}: {
  nombre: string;
  valor: T;
  opciones: OpcionSegmentada<T>[];
  alCambiar: (valor: T) => void;
  etiquetaGrupo: string;
  className?: string;
  deshabilitado?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiquetaGrupo}
      className={cn(
        "grid gap-1 rounded-lg border border-border bg-surface-2 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((opcion) => {
        const activo = opcion.valor === valor;
        const id = `${nombre}-${opcion.valor}`;

        return (
          <label
            key={opcion.valor}
            htmlFor={id}
            className={cn(
              "flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors select-none",
              activo
                ? "bg-brand text-white"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
              deshabilitado && "pointer-events-none opacity-50",
            )}
          >
            <input
              id={id}
              type="radio"
              name={nombre}
              value={opcion.valor}
              checked={activo}
              disabled={deshabilitado}
              onChange={() => alCambiar(opcion.valor)}
              className="sr-only"
            />
            {opcion.color ? (
              <span
                aria-hidden="true"
                style={{ backgroundColor: opcion.color }}
                className="size-2 shrink-0 rounded-full ring-1 ring-black/20"
              />
            ) : null}
            <span className="truncate">{opcion.etiqueta}</span>
          </label>
        );
      })}
    </div>
  );
}
