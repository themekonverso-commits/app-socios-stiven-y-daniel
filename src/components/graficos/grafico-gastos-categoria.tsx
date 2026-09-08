"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { GraficoVacio } from "@/components/graficos/grafico-vacio";
import { TooltipGrafico } from "@/components/graficos/tooltip-grafico";
import { COLOR_OTROS, PALETA_CATEGORIAS } from "@/components/graficos/tema";
import { formatearEuros, formatearPorcentaje } from "@/lib/formato";
import { porcentaje } from "@/lib/kpis";

export type PorcionGasto = {
  categoria: string;
  total: number;
  esOtros: boolean;
};

function colorDe(porcion: PorcionGasto, indice: number): string {
  if (porcion.esOtros) return COLOR_OTROS;
  return PALETA_CATEGORIAS[indice % PALETA_CATEGORIAS.length]!;
}

/**
 * Anillo de gastos por categoría, con el total en el centro y la lista al lado.
 *
 * La lista no es decorativa: leer proporciones exactas en un anillo es difícil,
 * y ahí están el importe y el porcentaje en cifras.
 */
export function GraficoGastosCategoria({
  porciones,
  total,
}: {
  porciones: PorcionGasto[];
  total: number;
}) {

  if (porciones.length === 0 || total === 0) {
    return <GraficoVacio mensaje="No hay gastos registrados en este periodo." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        {porciones.length === 1 ? (
          /*
           * Una sola categoría es un anillo completo, y ahí Recharts no dibuja
           * nada: un sector de 360° tiene el mismo punto de inicio y de fin, y
           * el arco degenera. Se probaron los ángulos explícitos (90 a −270) y
           * tampoco. Para este caso el anillo es sencillamente un círculo con
           * borde grueso, así que se dibuja a mano en vez de pelearse con la
           * librería: r = punto medio entre los radios, grosor = su diferencia.
           */
          <div
            style={{ height: 200 }}
            className="flex items-center justify-center"
          >
            <svg
              width={200}
              height={200}
              viewBox="0 0 200 200"
              role="img"
              aria-label={`${porciones[0]!.categoria}: el 100 % de los gastos`}
            >
              <circle
                cx={100}
                cy={100}
                r={77}
                fill="none"
                stroke={colorDe(porciones[0]!, 0)}
                strokeWidth={30}
              />
            </svg>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200} minHeight={200}>
            <PieChart>
              <Pie
                data={porciones}
                dataKey="total"
                nameKey="categoria"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                stroke="none"
                // Sin animación de entrada. El hook de movimiento reducido se
                // resuelve DESPUÉS del montaje, y ese segundo render reinicia
                // la animación del Pie dejando los sectores vacíos para
                // siempre. Un anillo no necesita animarse para entenderse.
                isAnimationActive={false}
              >
                {porciones.map((porcion, indice) => (
                  <Cell key={porcion.categoria} fill={colorDe(porcion, indice)} />
                ))}
              </Pie>

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const porcion = payload[0]?.payload as PorcionGasto | undefined;
                  if (!porcion) return null;
                  const pct = porcentaje(porcion.total, total);

                  return (
                    <TooltipGrafico
                      titulo={porcion.categoria}
                      filas={[
                        {
                          nombre: pct === null ? "Importe" : `${formatearPorcentaje(pct)} % del total`,
                          valor: porcion.total,
                          color: colorDe(
                            porcion,
                            porciones.findIndex((p) => p.categoria === porcion.categoria),
                          ),
                        },
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {/* Total en el centro del anillo. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-text-secondary">Total gastos</span>
          <span className="cifra text-lg font-semibold text-text-primary">
            {formatearEuros(total)}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {porciones.map((porcion, indice) => {
          const pct = porcentaje(porcion.total, total);
          return (
            <li key={porcion.categoria} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                style={{ backgroundColor: colorDe(porcion, indice) }}
                className="size-2.5 shrink-0 rounded-full"
              />
              <span className="min-w-0 truncate text-text-secondary">
                {porcion.categoria}
              </span>
              <span className="cifra ml-auto shrink-0 font-medium text-text-primary">
                {formatearEuros(porcion.total)}
              </span>
              <span className="cifra w-12 shrink-0 text-right text-xs text-text-muted">
                {pct === null ? "—" : `${formatearPorcentaje(pct)} %`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
