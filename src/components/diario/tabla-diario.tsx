"use client";

import { useMemo } from "react";
import { eachDayOfInterval, format, subDays } from "date-fns";

import { MenuAcciones } from "@/components/movimientos/menu-acciones";
import { cn } from "@/lib/utils";
import {
  formatearEntero,
  formatearEuros,
  formatearFecha,
  formatearNumero,
} from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/**
 * Últimos 30 días de ventas.
 *
 * Se pintan TODOS los días del rango, tengan registro o no: los huecos son la
 * información más útil de esta tabla, porque señalan los días que se olvidó
 * apuntar.
 */
export function TablaDiario({ filas }: { filas: MovimientoConRelaciones[] }) {
  const dias = useMemo(() => {
    const hoy = new Date();
    const porFecha = new Map<string, MovimientoConRelaciones>();
    for (const fila of filas) porFecha.set(fila.fecha, fila);

    return eachDayOfInterval({ start: subDays(hoy, 29), end: hoy })
      .map((dia) => {
        const clave = iso(dia);
        return { fecha: clave, movimiento: porFecha.get(clave) ?? null };
      })
      .reverse();
  }, [filas]);

  const totales = useMemo(() => {
    let pedidos = 0;
    let eur = 0;
    for (const fila of filas) {
      pedidos += fila.num_pedidos ?? 0;
      eur += Number(fila.total_eur) || 0;
    }
    return { pedidos, eur: redondear2(eur), dias: filas.length };
  }, [filas]);

  const ticketMedioGlobal =
    totales.pedidos > 0 ? redondear2(totales.eur / totales.pedidos) : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">
            Registro de ventas de los últimos 30 días
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3 text-right">Pedidos</th>
              <th scope="col" className="px-4 py-3 text-right">Ingresos</th>
              <th scope="col" className="px-4 py-3 text-right">Ingresos EUR</th>
              <th scope="col" className="px-4 py-3 text-right">Ticket medio</th>
              <th scope="col" className="px-2 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {dias.map(({ fecha, movimiento }) => {
              const pedidos = movimiento?.num_pedidos ?? 0;
              const eur = Number(movimiento?.total_eur ?? 0);
              const ticket = pedidos > 0 ? redondear2(eur / pedidos) : null;

              return (
                <tr
                  key={fecha}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    movimiento ? "hover:bg-surface" : "bg-surface/40",
                  )}
                >
                  <td className="cifra px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={
                        movimiento ? "text-text-primary" : "text-text-muted"
                      }
                    >
                      {formatearFecha(fecha)}
                    </span>
                  </td>

                  {movimiento ? (
                    <>
                      <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                        {formatearEntero(pedidos)}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                        {movimiento.divisa === "USD"
                          ? `${formatearNumero(Number(movimiento.total))} $`
                          : formatearEuros(Number(movimiento.total))}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right font-medium text-success">
                        {formatearEuros(eur)}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                        {ticket === null ? "—" : formatearEuros(ticket)}
                      </td>
                      <td className="px-2 py-2.5">
                        <MenuAcciones
                          movimiento={movimiento}
                          alCambiarOptimista={() => {}}
                        />
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                        <span
                          aria-hidden="true"
                          className="h-px w-6 bg-border"
                        />
                        Sin registro
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border bg-surface font-semibold">
              <td className="px-4 py-3 text-text-primary">
                Total
                <span className="ml-1 text-xs font-normal text-text-muted">
                  ({totales.dias} de 30 días)
                </span>
              </td>
              <td className="cifra px-4 py-3 text-right text-text-primary">
                {formatearEntero(totales.pedidos)}
              </td>
              <td className="px-4 py-3" />
              <td className="cifra px-4 py-3 text-right text-success">
                {formatearEuros(totales.eur)}
              </td>
              <td className="cifra px-4 py-3 text-right text-text-primary">
                {ticketMedioGlobal > 0 ? formatearEuros(ticketMedioGlobal) : "—"}
              </td>
              <td className="px-2 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
