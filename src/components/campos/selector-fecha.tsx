"use client";

import { useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatearFecha } from "@/lib/formato";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/**
 * Selector de fecha en formato español con accesos rápidos.
 *
 * El valor entra y sale como texto ISO (yyyy-MM-dd), que es lo que guarda la
 * columna `date`; se enseña como DD/MM/AAAA. Se evita `new Date("...")` sobre
 * la cadena ISO porque lo interpreta en UTC y en España puede restar un día.
 */
export function SelectorFecha({
  id,
  valor,
  alCambiar,
  invalido,
  className,
  conAccesosRapidos = true,
}: {
  id?: string;
  valor: string;
  alCambiar: (valor: string) => void;
  invalido?: boolean;
  className?: string;
  conAccesosRapidos?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  const seleccionada = valor ? parseISO(valor) : undefined;
  const hoy = iso(new Date());
  const ayer = iso(subDays(new Date(), 1));

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          data-invalido={invalido || undefined}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-left text-base text-text-primary transition-colors outline-none hover:bg-surface focus-visible:border-brand data-[invalido=true]:border-danger",
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
          <span className="cifra truncate">
            {valor ? formatearFecha(valor) : "Elige una fecha"}
          </span>
          {valor === hoy ? (
            <span className="ml-auto shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
              Hoy
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto border-border bg-surface p-0">
        {conAccesosRapidos ? (
          <div className="flex gap-1 border-b border-border p-2">
            <button
              type="button"
              onClick={() => {
                alCambiar(hoy);
                setAbierto(false);
              }}
              className="min-h-9 flex-1 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                alCambiar(ayer);
                setAbierto(false);
              }}
              className="min-h-9 flex-1 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              Ayer
            </button>
          </div>
        ) : null}

        <Calendar
          mode="single"
          locale={es}
          weekStartsOn={1}
          defaultMonth={seleccionada}
          selected={seleccionada}
          onSelect={(fecha) => {
            if (!fecha) return;
            alCambiar(iso(fecha));
            setAbierto(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
