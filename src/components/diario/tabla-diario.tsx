"use client";

import { useMemo } from "react";
import { eachDayOfInterval, format, subDays } from "date-fns";
import { CircleCheck, Clock } from "lucide-react";

import { MenuAcciones } from "@/components/movimientos/menu-acciones";
import { cn } from "@/lib/utils";
import {
  formatearEntero,
  formatearEuros,
  formatearFecha,
  formatearNumero,
} from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/metodos-cobro";
import type { CoberturaVentas } from "@/lib/consultas";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");
const fechaCorta = (fecha: string) => format(new Date(fecha), "dd/MM");

type Dia = {
  fecha: string;
  shopify: MovimientoConRelaciones[];
  paypal: MovimientoConRelaciones[];
};

const suma = (filas: MovimientoConRelaciones[], campo: "total_eur" | "num_pedidos") =>
  filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);

function metodoDe(fila: MovimientoConRelaciones): MetodoCobro {
  return fila.metodo_cobro === "paypal" ? "paypal" : "shopify_payments";
}

/**
 * Últimos 30 días de ventas, con una columna por método de cobro.
 *
 * Se pintan TODOS los días del rango, tengan registro o no: los huecos son la
 * información más útil de esta tabla, porque señalan los días que se olvidó
 * apuntar. Junto a cada método, si sus ventas ya las cubre un cobro de ese
 * mismo método o siguen pendientes.
 */
export function TablaDiario({
  filas,
  cobertura,
}: {
  filas: MovimientoConRelaciones[];
  cobertura: CoberturaVentas[];
}) {
  const dias = useMemo<Dia[]>(() => {
    const hoy = new Date();
    const porFecha = new Map<string, Dia>();
    for (const fila of filas) {
      const dia = porFecha.get(fila.fecha) ?? { fecha: fila.fecha, shopify: [], paypal: [] };
      if (metodoDe(fila) === "paypal") dia.paypal.push(fila);
      else dia.shopify.push(fila);
      porFecha.set(fila.fecha, dia);
    }

    return eachDayOfInterval({ start: subDays(hoy, 29), end: hoy })
      .map((dia) => {
        const clave = iso(dia);
        return porFecha.get(clave) ?? { fecha: clave, shopify: [], paypal: [] };
      })
      .reverse();
  }, [filas]);

  const cubiertas = useMemo(() => {
    const mapa = new Map<string, CoberturaVentas>();
    for (const c of cobertura) mapa.set(`${c.fecha}|${c.metodo}`, c);
    return mapa;
  }, [cobertura]);

  const totales = useMemo(() => {
    const shopify = filas.filter((f) => metodoDe(f) === "shopify_payments");
    const paypal = filas.filter((f) => metodoDe(f) === "paypal");
    return {
      shopify: redondear2(suma(shopify, "total_eur")),
      paypal: redondear2(suma(paypal, "total_eur")),
      eur: redondear2(suma(filas, "total_eur")),
      pedidos: suma(filas, "num_pedidos"),
      dias: new Set(filas.map((f) => f.fecha)).size,
    };
  }, [filas]);

  const ticketMedioGlobal =
    totales.pedidos > 0 ? redondear2(totales.eur / totales.pedidos) : 0;

  function celdaMetodo(fecha: string, metodo: MetodoCobro, movimientos: MovimientoConRelaciones[]) {
    if (movimientos.length === 0) {
      return (
        <td className="px-4 py-2.5 text-right text-text-muted">
          <span className="sr-only">Sin ventas {ETIQUETA_METODO[metodo]}</span>
          <span aria-hidden="true">—</span>
        </td>
      );
    }

    const eur = redondear2(suma(movimientos, "total_eur"));
    const pedidos = suma(movimientos, "num_pedidos");
    const usd = movimientos.find((m) => m.divisa === "USD");
    const estado = cubiertas.get(`${fecha}|${metodo}`);

    return (
      <td className="px-4 py-2.5">
        <div className="flex items-start justify-end gap-1">
          <div className="text-right">
            <span className="cifra block font-medium text-text-primary">
              {formatearEuros(eur)}
            </span>
            <span className="cifra block text-xs text-text-muted">
              {formatearEntero(pedidos)} ped.
              {usd ? ` · ${formatearNumero(Number(usd.total))} $` : ""}
            </span>
            {estado?.cubierta ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-success">
                <CircleCheck aria-hidden="true" className="size-3.5" />
                Cobrado{estado.cobroFecha ? ` ${fechaCorta(estado.cobroFecha)}` : ""}
              </span>
            ) : (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning">
                <Clock aria-hidden="true" className="size-3.5" />
                Pendiente de cobro
              </span>
            )}
          </div>
          {movimientos.map((movimiento) => (
            <MenuAcciones
              key={movimiento.id}
              movimiento={movimiento}
              alCambiarOptimista={() => {}}
            />
          ))}
        </div>
      </td>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <caption className="sr-only">
            Registro de ventas de los últimos 30 días, por método de cobro
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3 text-right">Shopify</th>
              <th scope="col" className="px-4 py-3 text-right">PayPal</th>
              <th scope="col" className="px-4 py-3 text-right">Total</th>
              <th scope="col" className="px-4 py-3 text-right">Pedidos</th>
              <th scope="col" className="px-4 py-3 text-right">Ticket medio</th>
            </tr>
          </thead>

          <tbody>
            {dias.map((dia) => {
              const todos = [...dia.shopify, ...dia.paypal];
              const hay = todos.length > 0;
              const eur = redondear2(suma(todos, "total_eur"));
              const pedidos = suma(todos, "num_pedidos");
              const ticket = pedidos > 0 ? redondear2(eur / pedidos) : null;

              return (
                <tr
                  key={dia.fecha}
                  className={cn(
                    "border-b border-border align-top last:border-b-0",
                    hay ? "hover:bg-surface" : "bg-surface/40",
                  )}
                >
                  <td className="cifra px-4 py-2.5 whitespace-nowrap">
                    <span className={hay ? "text-text-primary" : "text-text-muted"}>
                      {formatearFecha(dia.fecha)}
                    </span>
                  </td>

                  {hay ? (
                    <>
                      {celdaMetodo(dia.fecha, "shopify_payments", dia.shopify)}
                      {celdaMetodo(dia.fecha, "paypal", dia.paypal)}
                      <td className="cifra px-4 py-2.5 text-right font-medium text-success">
                        {formatearEuros(eur)}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                        {formatearEntero(pedidos)}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                        {ticket === null ? "—" : formatearEuros(ticket)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                        <span aria-hidden="true" className="h-px w-6 bg-border" />
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
                {formatearEuros(totales.shopify)}
              </td>
              <td className="cifra px-4 py-3 text-right text-text-primary">
                {formatearEuros(totales.paypal)}
              </td>
              <td className="cifra px-4 py-3 text-right text-success">
                {formatearEuros(totales.eur)}
              </td>
              <td className="cifra px-4 py-3 text-right text-text-primary">
                {formatearEntero(totales.pedidos)}
              </td>
              <td className="cifra px-4 py-3 text-right text-text-primary">
                {ticketMedioGlobal > 0 ? formatearEuros(ticketMedioGlobal) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
