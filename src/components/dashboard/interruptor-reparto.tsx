"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { PARAM_REPARTO } from "@/lib/kpis";
import { cn } from "@/lib/utils";

/**
 * Interruptor «Incluir parte de gastos generales» del dashboard de una
 * tienda. Vive en la URL (`?reparto=1`) para que la vista se pueda compartir
 * y para que el servidor la pinte ya calculada. Apagado por defecto.
 */
export function InterruptorReparto({ activo }: { activo: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const actuales = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  function cambiar(siguiente: boolean) {
    const params = new URLSearchParams(actuales.toString());
    if (siguiente) params.set(PARAM_REPARTO, "1");
    else params.delete(PARAM_REPARTO);
    const query = params.toString();
    iniciarTransicion(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary transition-colors hover:bg-surface-2",
        pendiente && "opacity-70",
      )}
    >
      <Switch
        checked={activo}
        onCheckedChange={cambiar}
        disabled={pendiente}
        aria-describedby="reparto-ayuda"
      />
      <span className="flex flex-col py-1.5">
        <span className="font-medium">Incluir parte de gastos generales</span>
        <span id="reparto-ayuda" className="text-xs text-text-secondary">
          Reparte lo compartido según lo que factura cada tienda. Solo visual.
        </span>
      </span>
    </label>
  );
}
