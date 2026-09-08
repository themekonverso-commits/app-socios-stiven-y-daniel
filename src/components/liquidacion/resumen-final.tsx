import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatearEuros } from "@/lib/formato";
import type { LiquidacionFinal, ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * La frase que de verdad importa: si esto se cerrara hoy, quién le debe cuánto
 * a quién. En castellano y con los nombres reales, no en jerga contable.
 */
export function ResumenFinal({
  liquidacion,
  socios,
}: {
  liquidacion: LiquidacionFinal | null;
  socios: ResumenSocio[];
}) {
  const nombreDe = (id: string | null) =>
    socios.find((s) => s.socio_id === id)?.nombre ?? "el otro socio";

  const hayCompensacion =
    liquidacion !== null &&
    liquidacion.acreedor_id !== null &&
    liquidacion.deudor_id !== null &&
    liquidacion.importe_a_compensar > 0;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary">
          {hayCompensacion ? (
            <>
              Si el proyecto se liquidara hoy,{" "}
              <span className="font-semibold">
                {nombreDe(liquidacion.acreedor_id)}
              </span>{" "}
              debería recibir{" "}
              <span className="cifra font-semibold text-brand">
                {formatearEuros(liquidacion.importe_a_compensar)}
              </span>{" "}
              de{" "}
              <span className="font-semibold">
                {nombreDe(liquidacion.deudor_id)}
              </span>
              .
            </>
          ) : (
            <>
              Ambos socios están al día. No hay compensación pendiente entre
              ellos.
            </>
          )}
        </p>

        {liquidacion ? (
          <p className="cifra mt-1 text-xs text-text-secondary">
            Neto anticipado entre los dos:{" "}
            {formatearEuros(liquidacion.total_neto)} · le corresponde la mitad a
            cada uno: {formatearEuros(liquidacion.mitad_correspondiente)}
          </p>
        ) : null}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="De dónde sale esta cifra"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <Info aria-hidden="true" className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          Regla 7 del contrato: se suma lo anticipado por cada socio, se resta lo
          ya reembolsado y el saldo neto se reparte por mitades. Quien haya
          puesto por encima de su mitad tiene un crédito contra el otro por el
          exceso.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
