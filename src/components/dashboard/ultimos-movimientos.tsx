import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

export function UltimosMovimientos({
  movimientos,
  enlaceVerTodos,
}: {
  movimientos: MovimientoConRelaciones[];
  /** Conserva el periodo en la URL al saltar a /movimientos. */
  enlaceVerTodos: string;
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
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <caption className="sr-only">Últimos movimientos del periodo</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                <th scope="col" className="py-2 pr-3">Fecha</th>
                <th scope="col" className="py-2 pr-3">Concepto</th>
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
