"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { MenuPeriodo } from "@/components/campos/menu-periodo";
import { cn } from "@/lib/utils";
import { formatearFecha } from "@/lib/formato";
import {
  PRESETS_PERIODO,
  escribirPeriodo,
  rangoDePresetPeriodo,
  type Periodo,
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
    <MenuPeriodo
      preset={periodo.preset}
      desde={periodo.desde}
      hasta={periodo.hasta}
      alElegirPreset={(preset) => {
        if (preset === "personalizado") {
          navegar({ ...periodo, preset: "personalizado" });
          return;
        }
        navegar({
          preset,
          ...rangoDePresetPeriodo(preset),
          comparativa:
            PRESETS_PERIODO.find((p) => p.valor === preset)?.comparativa ??
            "vs. periodo previo",
        });
      }}
      alCambiarDesde={(valor) =>
        navegar({ ...periodo, preset: "personalizado", desde: valor })
      }
      alCambiarHasta={(valor) =>
        navegar({ ...periodo, preset: "personalizado", hasta: valor })
      }
    >
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
    </MenuPeriodo>
  );
}
