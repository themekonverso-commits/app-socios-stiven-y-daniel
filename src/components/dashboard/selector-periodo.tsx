"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { SelectorFecha } from "@/components/campos/selector-fecha";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatearFecha } from "@/lib/formato";
import {
  PRESETS_PERIODO,
  escribirPeriodo,
  rangoDePresetPeriodo,
  type Periodo,
  type PresetPeriodo,
} from "@/lib/periodo";

/**
 * Selector de periodo global. Afecta a toda la pantalla y se guarda en la URL,
 * así que una vista se puede compartir y el botón «atrás» funciona.
 */
export function SelectorPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();

  function navegar(siguiente: Periodo) {
    const query = escribirPeriodo(siguiente);
    iniciarTransicion(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const etiqueta =
    PRESETS_PERIODO.find((p) => p.valor === periodo.preset)?.etiqueta ?? "Periodo";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Periodo: ${etiqueta}`}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary transition-colors hover:bg-surface",
            pendiente && "opacity-70",
          )}
        >
          <span className="font-medium">{etiqueta}</span>
          <span className="cifra hidden text-text-muted sm:inline">
            {formatearFecha(periodo.desde)} – {formatearFecha(periodo.hasta)}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 border-border bg-surface p-2">
        <div className="flex flex-col gap-1">
          {PRESETS_PERIODO.map((preset) => (
            <button
              key={preset.valor}
              type="button"
              onClick={() => {
                if (preset.valor === "personalizado") {
                  navegar({ ...periodo, preset: "personalizado" });
                  return;
                }
                const rango = rangoDePresetPeriodo(preset.valor as PresetPeriodo);
                navegar({
                  preset: preset.valor as PresetPeriodo,
                  ...rango,
                  comparativa: preset.comparativa,
                });
              }}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                periodo.preset === preset.valor
                  ? "bg-surface-2 font-medium text-text-primary"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
              )}
            >
              <Check
                aria-hidden="true"
                className={cn(
                  "size-4 text-brand",
                  periodo.preset === preset.valor ? "opacity-100" : "opacity-0",
                )}
              />
              {preset.etiqueta}
            </button>
          ))}
        </div>

        {periodo.preset === "personalizado" ? (
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Desde</span>
              <SelectorFecha
                valor={periodo.desde}
                conAccesosRapidos={false}
                alCambiar={(valor) =>
                  navegar({ ...periodo, preset: "personalizado", desde: valor })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Hasta</span>
              <SelectorFecha
                valor={periodo.hasta}
                conAccesosRapidos={false}
                alCambiar={(valor) =>
                  navegar({ ...periodo, preset: "personalizado", hasta: valor })
                }
              />
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
