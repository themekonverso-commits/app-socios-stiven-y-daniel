import { COLOR_GENERAL } from "@/lib/ambito";
import type { AnticipoPendiente } from "@/lib/tipos-liquidacion";

/** Punto de color y nombre de la tienda de un anticipo (General si no tiene). */
export function CeldaTienda({ anticipo }: { anticipo: AnticipoPendiente }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
      <span
        aria-hidden="true"
        style={{ backgroundColor: anticipo.tienda_color ?? COLOR_GENERAL }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="truncate">{anticipo.tienda}</span>
    </span>
  );
}
