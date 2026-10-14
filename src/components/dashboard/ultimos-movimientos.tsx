import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { colorTienda, nombreTienda, type Tienda } from "@/lib/ambito";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

export function UltimosMovimientos({
  movimientos,
  enlaceVerTodos,
  tiendas = null,
}: {
  movimientos: MovimientoConRelaciones[];
  /** Conserva el periodo y la tienda en la URL al saltar a /movimientos. */
  enlaceVerTodos: string;
  /**
   * En «Todas», la lista de tiendas para decir de cuál es cada movimiento.
   * En una tienda o en General sobra: ya se sabe.
   */
  tiendas?: Tienda[] | null;
}) {
  return (
    <TarjetaBloque
      titulo="Últimos movimientos"
      descripcion="Los 8 registros más recientes del periodo."
      accion={
        <Link
          href={enlaceVerTodos}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
        >
          Ver todos
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      {movimientos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
          No hay movimientos en este periodo.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse text-sm ${tiendas ? "min-w-[660px]" : "min-w-[520px]"}`}
          >
            <caption className="sr-only">Últimos movimientos del periodo</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                <th scope="col" className="py-2 pr-3">Fecha</th>
                <th scope="col" className="py-2 pr-3">Concepto</th>
                {tiendas ? (
                  <th scope="col" className="py-2 pr-3">Tienda</th>
                ) : null}
                <th scope="col" className="py-2 pr-3">Categoría</th>
                <th scope="col" className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((movimiento) => {
                const esIngreso = movimiento.tipo === "ingreso";
                return (
                  <tr key={movimiento.id} className="border-b border-border last:border-b-0">
                    <td className="cifra py-2.5 pr-3 whitespace-nowrap text-text-secondary">
                      {formatearFecha(movimiento.fecha)}
                    </td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3 text-text-primary">
                      {movimiento.concepto}
                    </td>
                    {tiendas ? (
                      <td className="max-w-[160px] py-2.5 pr-3">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: colorTienda(movimiento.tienda_id, tiendas) }}
                          />
                          <span className="truncate">
                            {nombreTienda(movimiento.tienda_id, tiendas)}
                          </span>
                        </span>
                      </td>
                    ) : null}
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex max-w-full truncate rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                        {movimiento.categorias?.nombre ?? "—"}
                      </span>
                    </td>
                    <td
                      className={`cifra py-2.5 text-right font-medium whitespace-nowrap ${
                        esIngreso ? "text-success" : "text-danger"
                      }`}
                    >
                      {esIngreso ? "+" : "−"}
                      {formatearEuros(Math.abs(Number(movimiento.total_eur)))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TarjetaBloque>
  );
}
