"use client";

import { IconoAmbito } from "@/components/tiendas/selector-tienda";
import { useAmbito } from "@/components/tiendas/proveedor-tiendas";
import { colorAmbito, nombreAmbito } from "@/lib/ambito";

/**
 * Nombre y color de la tienda activa junto al título de cada página: la
 * tienda tiene que ser evidente en todo momento.
 */
export function EtiquetaAmbito() {
  const ambito = useAmbito();
  const color = colorAmbito(ambito);

  return (
    <span
      className="inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 align-middle text-sm font-medium text-text-primary"
      style={{ borderColor: `${color}80`, backgroundColor: `${color}1A` }}
    >
      <IconoAmbito tipo={ambito.tipo} color={color} className="size-3" />
      <span className="truncate">{nombreAmbito(ambito)}</span>
    </span>
  );
}
