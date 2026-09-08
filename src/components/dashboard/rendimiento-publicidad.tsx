import { GraficoPublicidad } from "@/components/graficos/grafico-publicidad";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { formatearEuros, formatearNumero } from "@/lib/formato";
import { calcularRoas, dividir, redondear1 } from "@/lib/kpis";
import type { GastoPlataforma, ResumenPeriodo } from "@/lib/consultas-kpi";
import type { PuntoSerie } from "@/lib/series";

function Metrica({
  etiqueta,
  valor,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  ayuda: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-base p-3">
      <p className="text-xs text-text-secondary">{etiqueta}</p>
      <p className="cifra mt-1 text-lg font-semibold text-text-primary">{valor}</p>
      <p className="mt-0.5 text-[11px] text-text-muted">{ayuda}</p>
    </div>
  );
}

/**
 * Rendimiento publicitario. Solo se pinta si hubo inversión en el periodo:
 * un bloque vacío de publicidad en un mes sin campañas es ruido.
 */
export function RendimientoPublicidad({
  puntos,
  resumen,
  plataformas,
  dias,
}: {
  puntos: PuntoSerie[];
  resumen: ResumenPeriodo;
  plataformas: GastoPlataforma[];
  dias: number;
}) {
  const cpa = dividir(resumen.gastoAds, resumen.pedidos, 2);
  const cpc = dividir(resumen.gastoAds, resumen.clicks, 2);
  const gastoMedioDiario = dividir(resumen.gastoAds, dias, 2);

  const ctrRatio = dividir(resumen.clicks, resumen.impresiones, 2);
  const ctr = ctrRatio === null ? null : redondear1(ctrRatio * 100);

  return (
    <TarjetaBloque
      titulo="Rendimiento publicitario"
      descripcion="Inversión frente a facturación en el periodo."
    >
      <GraficoPublicidad puntos={puntos} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          etiqueta="CPA"
          valor={cpa === null ? "—" : formatearEuros(cpa)}
          ayuda="Coste por pedido"
        />
        <Metrica
          etiqueta="CTR"
          valor={ctr === null ? "—" : `${formatearNumero(ctr)} %`}
          ayuda="Clicks entre impresiones"
        />
        <Metrica
          etiqueta="CPC"
          valor={cpc === null ? "—" : formatearEuros(cpc)}
          ayuda="Coste por click"
        />
        <Metrica
          etiqueta="Gasto medio diario"
          valor={gastoMedioDiario === null ? "—" : formatearEuros(gastoMedioDiario)}
          ayuda={`Sobre ${dias} día${dias === 1 ? "" : "s"}`}
        />
      </div>

      {plataformas.length > 1 ? (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <caption className="sr-only">
                Desglose del gasto publicitario por plataforma
              </caption>
              <thead>
                <tr className="border-b border-border bg-base text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                  <th scope="col" className="px-3 py-2">Plataforma</th>
                  <th scope="col" className="px-3 py-2 text-right">Gasto</th>
                  <th scope="col" className="px-3 py-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {plataformas.map((fila) => {
                  const roas = calcularRoas(resumen.ingresos, fila.gasto);
                  return (
                    <tr key={fila.plataforma} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 text-text-primary">{fila.plataforma}</td>
                      <td className="cifra px-3 py-2 text-right text-text-secondary">
                        {formatearEuros(fila.gasto)}
                      </td>
                      <td className="cifra px-3 py-2 text-right text-text-secondary">
                        {roas === null ? "—" : `${formatearNumero(roas)}x`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Sin atribución por plataforma, este ROAS es orientativo. Decirlo
              evita que se tomen decisiones de reparto de presupuesto sobre una
              cifra que no significa lo que parece. */}
          <p className="mt-2 text-[11px] text-text-muted">
            El ROAS por plataforma reparte la facturación total entre el gasto de
            cada una: sirve para comparar magnitudes, no como atribución real.
          </p>
        </div>
      ) : null}
    </TarjetaBloque>
  );
}
