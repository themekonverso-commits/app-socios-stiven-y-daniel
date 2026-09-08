import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";

import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { CuentaConCoste } from "@/lib/tipos-cuentas";

/** Las 3 próximas renovaciones, al lado de los últimos movimientos. */
export function ProximasRenovaciones({ cuentas }: { cuentas: CuentaConCoste[] }) {
  return (
    <TarjetaBloque
      titulo="Próximas renovaciones"
      descripcion="Lo que se cobra pronto."
      accion={
        <Link
          href="/cuentas"
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
        >
          Ver todas
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      {cuentas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
          No hay renovaciones programadas.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cuentas.map((cuenta) => {
            const dias = cuenta.dias_para_renovar ?? 0;
            return (
              <li
                key={String(cuenta.id)}
                className="flex items-center gap-3 rounded-lg border border-border bg-base p-3"
              >
                <CalendarClock
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    cuenta.vencida
                      ? "text-danger"
                      : cuenta.renueva_pronto
                        ? "text-warning"
                        : "text-text-muted",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {cuenta.nombre}
                  </p>
                  <p className="cifra truncate text-xs text-text-secondary">
                    {cuenta.fecha_renovacion
                      ? formatearFecha(String(cuenta.fecha_renovacion))
                      : "—"}
                    {" · "}
                    {dias < 0
                      ? `vencida hace ${Math.abs(dias)} d`
                      : dias === 0
                        ? "hoy"
                        : `en ${dias} d`}
                  </p>
                </div>
                <span className="cifra shrink-0 text-sm font-medium text-text-primary">
                  {formatearEuros(Number(cuenta.coste_eur ?? 0))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TarjetaBloque>
  );
}
