import { formatearEuros } from "@/lib/formato";
import { porcentaje } from "@/lib/kpis";
import { cn } from "@/lib/utils";
import type { ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * Estado de un socio: cuánto puso, cuánto ha cobrado y cuánto se le debe.
 * El acento de la tarjeta es el color del socio, para poder distinguirlas de
 * un vistazo sin leer el nombre.
 *
 * El total anticipado se desglosa en lo que consume el cupo de la tarjeta y lo
 * que no (R6), pero el PENDIENTE DE COBRO es la suma de los dos: el contrato
 * no distingue por categoría, todo anticipo justificado da derecho a reembolso.
 */
export function TarjetaSocio({
  socio,
  ambito,
}: {
  socio: ResumenSocio;
  /** Categoría del cupo. Sin ella no hay desglose que enseñar. */
  ambito?: string | null;
}) {
  const color = socio.color ?? "#6E6E73";
  const pct = porcentaje(socio.reembolsado, socio.anticipado) ?? 0;
  const saldado = socio.pendiente <= 0 && socio.anticipado > 0;

  // Sin ámbito el desglose no dice nada: todo caería en una sola línea.
  const hayDesglose = Boolean(ambito) && socio.anticipado > 0;

  return (
    <article
      className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 sm:p-5"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          style={{ backgroundColor: color }}
          className="size-3 shrink-0 rounded-full"
        />
        <h3 className="truncate text-base font-semibold text-text-primary">
          {socio.nombre}
        </h3>
        <span className="cifra ml-auto shrink-0 text-xs text-text-muted">
          {socio.num_anticipos} anticipo{socio.num_anticipos === 1 ? "" : "s"}
        </span>
      </div>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Total anticipado</dt>
          <dd className="cifra font-medium text-text-primary">
            {formatearEuros(socio.anticipado)}
          </dd>
        </div>

        {hayDesglose ? (
          <div className="flex flex-col gap-1 border-l-2 border-border pl-3 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-muted">{ambito}</dt>
              <dd className="cifra text-text-secondary">
                {formatearEuros(socio.anticipado_cupo)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-muted">Otros gastos</dt>
              <dd className="cifra text-text-secondary">
                {formatearEuros(socio.anticipado_otros)}
              </dd>
            </div>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Ya reembolsado</dt>
          <dd className="cifra font-medium text-success">
            {formatearEuros(socio.reembolsado)}
          </dd>
        </div>

        <div className="mt-1 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs font-semibold tracking-wide text-text-muted uppercase">
              Pendiente de cobro
            </dt>
          </div>
          <dd
            className={cn(
              "cifra mt-1 text-2xl font-semibold",
              saldado ? "text-success" : socio.pendiente > 0 ? "text-warning" : "text-text-primary",
            )}
          >
            {formatearEuros(socio.pendiente)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Reembolsado a ${socio.nombre}: ${Math.round(pct)} por ciento`}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              backgroundColor: color,
            }}
            className="h-full rounded-full transition-[width] duration-500"
          />
        </div>
        <p className="cifra mt-1.5 text-xs text-text-secondary">
          {socio.anticipado === 0
            ? "Todavía no ha adelantado nada."
            : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(pct)} % reembolsado`}
        </p>
      </div>
    </article>
  );
}
