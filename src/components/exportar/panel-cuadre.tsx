import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { formatearEntero, formatearEuros } from "@/lib/formato";
import type { BloqueIva, Cuadre } from "@/lib/consultas-gestoria";

/**
 * Cuadre de los subtotales por tipo de IVA.
 *
 * Esta tabla es la parte crítica de la exportación: si la suma de los
 * subtotales por tipo no coincide al céntimo con el total general, el
 * descuadre se MUESTRA, no se esconde ni se reparte por ahí. Un céntimo de
 * diferencia es una señal de que algo está mal en los datos, y prefiero que
 * salte aquí que en el despacho de la gestoría.
 */
export function PanelCuadre({
  titulo,
  bloque,
  cuadre,
}: {
  titulo: string;
  bloque: BloqueIva;
  cuadre: Cuadre;
}) {
  const vacio = bloque.por_tipo.length === 0;

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-text-primary">{titulo}</h3>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-secondary">
              <th scope="col" className="pb-2 pr-3 font-medium">Tipo</th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">Ops.</th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">Base</th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">Cuota IVA</th>
              <th scope="col" className="pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {vacio ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-text-secondary">
                  Sin operaciones en el periodo.
                </td>
              </tr>
            ) : (
              bloque.por_tipo.map((tramo) => {
                const otros = tramo.tipo_iva === null;
                return (
                  <tr
                    key={tramo.tipo_iva ?? "otros"}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      {otros ? (
                        <span className="font-medium text-warning">
                          Otros (no estándar)
                        </span>
                      ) : (
                        <span className="tabular-nums text-text-primary">
                          {tramo.tipo_iva} %
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                      {formatearEntero(tramo.operaciones)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-primary">
                      {formatearEuros(tramo.base)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-primary">
                      {formatearEuros(tramo.cuota)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-primary">
                      {formatearEuros(tramo.total)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-text-secondary">
              <th scope="row" className="py-2 pr-3 text-left text-xs font-medium">
                Suma de los subtotales
              </th>
              <td className="py-2 pr-3" />
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatearEuros(cuadre.suma_subtotales_base)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatearEuros(cuadre.suma_subtotales_cuota)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatearEuros(cuadre.suma_subtotales_total)}
              </td>
            </tr>
            <tr className="font-semibold text-text-primary">
              <th scope="row" className="py-2 pr-3 text-left">
                Total general
              </th>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatearEntero(bloque.operaciones)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatearEuros(cuadre.total_general_base)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatearEuros(cuadre.total_general_cuota)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatearEuros(cuadre.total_general_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* La línea de veredicto. Siempre visible, cuadre o no. */}
      <p
        className={
          cuadre.cuadra
            ? "mt-3 flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
            : "mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
        }
      >
        {cuadre.cuadra ? (
          <CheckCircle2 aria-hidden="true" className="mt-px size-4 shrink-0" />
        ) : (
          <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
        )}
        <span>
          {cuadre.cuadra
            ? "Los subtotales por tipo suman exactamente el total general."
            : `Descuadre de ${formatearEuros(cuadre.descuadre_total)} en el total (base ${formatearEuros(cuadre.descuadre_base)}, cuota ${formatearEuros(cuadre.descuadre_cuota)}). No lo corrijas a mano: revisa las operaciones del periodo antes de mandar nada.`}
        </span>
      </p>

      {cuadre.hay_tipos_no_estandar ? (
        <p className="mt-2 flex items-start gap-2 text-xs text-warning">
          <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>
            Hay operaciones con un tipo de IVA que no es 21 %, 10 %, 4 % ni 0 %.
            Van agrupadas como «Otros» y la gestoría tendrá que mirarlas una a una.
          </span>
        </p>
      ) : null}
    </div>
  );
}
