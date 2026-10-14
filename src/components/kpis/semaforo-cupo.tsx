import Link from "next/link";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatearEuros, formatearNumero } from "@/lib/formato";
import { nivelCupo, type CupoTarjeta, type NivelCupo } from "@/lib/cupo";

const ESTILO: Record<
  NivelCupo,
  { caja: string; texto: string; barra: string; Icono: typeof CircleCheck; etiqueta: string }
> = {
  ok: {
    caja: "border-success/40 bg-success/10",
    texto: "text-success",
    barra: "bg-success",
    Icono: CircleCheck,
    etiqueta: "En verde",
  },
  aviso: {
    caja: "border-warning/40 bg-warning/10",
    texto: "text-warning",
    barra: "bg-warning",
    Icono: TriangleAlert,
    etiqueta: "Atención",
  },
  superado: {
    caja: "border-danger/40 bg-danger/10",
    texto: "text-danger",
    barra: "bg-danger",
    Icono: CircleAlert,
    etiqueta: "Superado",
  },
};

/**
 * Semáforo del cupo de la tarjeta (R6). Es de la sociedad, así que sale en
 * todas las vistas con el mismo número: verde por debajo del aviso, ámbar
 * desde `aviso_pct` y rojo al llegar al 100 %. El nivel va en icono y texto,
 * no solo en color.
 */
export function SemaforoCupo({
  cupo,
  enlace,
}: {
  cupo: CupoTarjeta;
  /** /movimientos filtrado por la tarjeta. */
  enlace: string;
}) {
  const nivel = nivelCupo(cupo);
  const estilo = ESTILO[nivel];
  const pct = cupo.pct ?? 0;
  const titular = cupo.socio_nombre ?? "Daniel";

  if (cupo.limite <= 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
        No hay cupo acordado para la tarjeta.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex items-start gap-3 rounded-lg border p-4", estilo.caja)}>
        <estilo.Icono aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", estilo.texto)} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
            Tarjeta de {titular}: {formatearNumero(pct)} % del cupo
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                estilo.caja,
                estilo.texto,
              )}
            >
              {estilo.etiqueta}
            </span>
          </p>
          <p className="cifra mt-0.5 text-sm text-text-secondary">
            {formatearEuros(cupo.consumido)} de {formatearEuros(cupo.limite)} ·{" "}
            {cupo.disponible >= 0
              ? `quedan ${formatearEuros(cupo.disponible)}`
              : `${formatearEuros(-cupo.disponible)} por encima`}
          </p>
        </div>
      </div>

      <div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Consumido el ${Math.round(pct)} % del cupo de la tarjeta`}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            className={cn("h-full rounded-full transition-[width] duration-500", estilo.barra)}
          />
        </div>
        <p className="mt-1.5 text-xs text-text-secondary">
          Ámbar desde el <span className="cifra">{cupo.aviso_pct} %</span>, rojo al{" "}
          <span className="cifra">100 %</span>. Suma los gastos pagados con la tarjeta en
          todas las tiendas y en General.
        </p>
      </div>

      <Link
        href={enlace}
        className="inline-flex min-h-11 items-center text-sm font-medium text-brand transition-colors hover:text-brand-hover"
      >
        Ver los gastos de la tarjeta →
      </Link>
    </div>
  );
}
