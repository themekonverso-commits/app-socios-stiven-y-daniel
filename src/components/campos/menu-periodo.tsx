"use client";

import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check } from "lucide-react";

import { SelectorFecha } from "@/components/campos/selector-fecha";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PRESETS_PERIODO, type PresetPeriodo } from "@/lib/periodo";

/**
 * Lista de presets de periodo, compartida por el selector del dashboard y la
 * barra de filtros de /movimientos.
 *
 * Con once opciones, un popover en el móvil se sale de la pantalla: por debajo
 * de 768px (donde desaparece la sidebar) se abre como panel inferior.
 */

const CONSULTA_MOVIL = "(max-width: 767px)";

function suscribir(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOVIL);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

function useEsMovil(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA_MOVIL).matches,
    () => false,
  );
}

type Props = {
  preset: PresetPeriodo;
  desde: string;
  hasta: string;
  alElegirPreset: (preset: PresetPeriodo) => void;
  alCambiarDesde: (valor: string) => void;
  alCambiarHasta: (valor: string) => void;
  /** Alineación del popover en escritorio. */
  alineacion?: "start" | "end";
  /** El botón que abre el menú. */
  children: ReactNode;
};

export function MenuPeriodo({
  preset,
  desde,
  hasta,
  alElegirPreset,
  alCambiarDesde,
  alCambiarHasta,
  alineacion = "end",
  children,
}: Props) {
  const esMovil = useEsMovil();
  const [abiertoMovil, setAbiertoMovil] = useState(false);

  const contenido = (alElegir: (valor: PresetPeriodo) => void) => (
    <>
      <div className="flex flex-col gap-1">
        {PRESETS_PERIODO.map((opcion, indice) => {
          const nuevoGrupo =
            indice > 0 && PRESETS_PERIODO[indice - 1].grupo !== opcion.grupo;
          const activo = preset === opcion.valor;
          return (
            <Fragment key={opcion.valor}>
              {nuevoGrupo ? (
                <div role="separator" className="my-1 h-px bg-border" />
              ) : null}
              <button
                type="button"
                onClick={() => alElegir(opcion.valor)}
                aria-pressed={activo}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                  activo
                    ? "bg-surface-2 font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                )}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    "size-4 text-brand",
                    activo ? "opacity-100" : "opacity-0",
                  )}
                />
                {opcion.etiqueta}
              </button>
            </Fragment>
          );
        })}
      </div>

      {preset === "personalizado" ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Desde</span>
            <SelectorFecha
              valor={desde}
              conAccesosRapidos={false}
              alCambiar={alCambiarDesde}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Hasta</span>
            <SelectorFecha
              valor={hasta}
              conAccesosRapidos={false}
              alCambiar={alCambiarHasta}
            />
          </div>
        </div>
      ) : null}
    </>
  );

  if (esMovil) {
    return (
      <Sheet open={abiertoMovil} onOpenChange={setAbiertoMovil}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-xl border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0 pb-0">
            <SheetTitle>Periodo</SheetTitle>
            <SheetDescription className="sr-only">
              Elige el rango de fechas.
            </SheetDescription>
          </SheetHeader>
          {contenido((valor) => {
            alElegirPreset(valor);
            // «Personalizado» se queda abierto para poder elegir las fechas.
            if (valor !== "personalizado") setAbiertoMovil(false);
          })}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={alineacion}
        className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto border-border bg-surface p-2"
      >
        {contenido(alElegirPreset)}
      </PopoverContent>
    </Popover>
  );
}
