"use client";

import { Plus } from "lucide-react";

import { usePanelMovimiento } from "@/components/movimientos/proveedor-movimientos";
import { cn } from "@/lib/utils";

export function BotonNuevoMovimiento({
  className,
  etiqueta = "Nuevo movimiento",
}: {
  className?: string;
  etiqueta?: string;
}) {
  const { abrirNuevo } = usePanelMovimiento();

  return (
    <button
      type="button"
      onClick={abrirNuevo}
      className={cn(
        "flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover",
        className,
      )}
    >
      <Plus aria-hidden="true" className="size-4" />
      {etiqueta}
    </button>
  );
}
