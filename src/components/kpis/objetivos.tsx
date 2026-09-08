import Link from "next/link";
import { Target } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatearEuros, formatearPorcentaje } from "@/lib/formato";
import { porcentaje } from "@/lib/kpis";

function Barra({
  etiqueta,
  actual,
  objetivo,
}: {
  etiqueta: string;
  actual: number;
  objetivo: number;
}) {
  const pct = porcentaje(actual, objetivo);
  // La barra se corta al 100 %; el número sí puede pasarse, que es la gracia.
  const ancho = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const cumplido = pct !== null && pct >= 100;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{etiqueta}</span>
        <span className="cifra text-sm text-text-secondary">
          {formatearEuros(actual)}{" "}
          <span className="text-text-muted">de {formatearEuros(objetivo)}</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={ancho}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${etiqueta}: ${pct ?? 0} por ciento del objetivo`}
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          style={{ width: `${ancho}%` }}
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            cumplido ? "bg-success" : "bg-brand",
          )}
        />
      </div>

      <p className="cifra mt-1.5 text-xs text-text-secondary">
        {pct === null ? "—" : `${formatearPorcentaje(pct)} % alcanzado`}
      </p>
    </div>
  );
}

/**
 * Progreso del mes en curso frente a los objetivos. Deliberadamente sobre el
 * MES ACTUAL y no sobre el periodo seleccionado: un objetivo mensual comparado
 * con un trimestre no significa nada.
 */
export function Objetivos({
  facturacionMes,
  beneficioMes,
  objetivoFacturacion,
  objetivoBeneficio,
  diasRestantes,
}: {
  facturacionMes: number;
  beneficioMes: number;
  objetivoFacturacion: number;
  objetivoBeneficio: number;
  diasRestantes: number;
}) {
  const hayObjetivos = objetivoFacturacion > 0 || objetivoBeneficio > 0;

  if (!hayObjetivos) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <Target aria-hidden="true" className="size-6 text-text-muted" />
        <p className="mt-3 text-sm text-text-secondary">
          Todavía no has fijado objetivos mensuales.
        </p>
        <Link
          href="/ajustes"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Definirlos en Ajustes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-text-secondary">
        Mes en curso · quedan{" "}
        <span className="cifra font-medium text-text-primary">{diasRestantes}</span>{" "}
        día{diasRestantes === 1 ? "" : "s"}
      </p>

      {objetivoFacturacion > 0 ? (
        <Barra
          etiqueta="Facturación"
          actual={facturacionMes}
          objetivo={objetivoFacturacion}
        />
      ) : null}

      {objetivoBeneficio > 0 ? (
        <Barra
          etiqueta="Beneficio"
          actual={beneficioMes}
          objetivo={objetivoBeneficio}
        />
      ) : null}
    </div>
  );
}
