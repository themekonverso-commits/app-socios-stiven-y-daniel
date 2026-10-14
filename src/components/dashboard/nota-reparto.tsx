import { Info, Scale } from "lucide-react";

import { formatearEuros, formatearPorcentaje } from "@/lib/formato";
import type { Reparto } from "@/lib/kpis";

/**
 * Explica qué ha hecho el interruptor de reparto: cuánto se ha imputado a la
 * tienda y con qué cuenta, o por qué no se ha repartido nada. Sin esta nota
 * el beneficio cambiaría «solo» y nadie sabría de dónde salen los euros.
 */
export function NotaReparto({
  reparto,
  nombreTienda,
}: {
  reparto: Reparto;
  nombreTienda: string;
}) {
  if (!reparto.aplica) {
    return (
      <p className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3 text-sm text-text-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <span>
          {reparto.motivo === "sin-gastos-general"
            ? "No hay gastos de General en este periodo: no hay nada que repartir."
            : `Ninguna tienda ha facturado en este periodo, así que no hay una proporción con la que repartir los ${formatearEuros(reparto.gastosGeneral)} de gastos de General. No se ha imputado nada.`}
        </span>
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-brand/30 bg-brand-soft p-3 text-sm text-text-secondary">
      <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      <span>
        Se han imputado{" "}
        <span className="cifra font-semibold text-text-primary">
          {formatearEuros(reparto.imputado)}
        </span>{" "}
        de gastos generales a {nombreTienda}: el{" "}
        <span className="cifra">{formatearPorcentaje(reparto.pct)} %</span> de los{" "}
        <span className="cifra">{formatearEuros(reparto.gastosGeneral)}</span> de General del
        periodo, el mismo peso que tiene su facturación (
        <span className="cifra">{formatearEuros(reparto.facturacionTienda)}</span> de{" "}
        <span className="cifra">{formatearEuros(reparto.facturacionTotal)}</span> entre todas
        las tiendas). Se restan del beneficio de los indicadores y del de su periodo anterior,
        para que la comparación sea justa; los gráficos siguen mostrando solo lo de la tienda.
        Es solo visual: la liquidación, la caja y los movimientos no cambian.
      </span>
    </p>
  );
}
