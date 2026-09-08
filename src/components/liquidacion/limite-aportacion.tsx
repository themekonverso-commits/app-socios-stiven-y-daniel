import { CircleAlert, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatearEuros } from "@/lib/formato";
import { porcentaje } from "@/lib/kpis";
import type { ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * R6 — límite de aportación acordado y reunión de continuidad.
 *
 * Verde por debajo del umbral, ámbar al acercarse, rojo al superarlo. El color
 * va acompañado siempre de icono y texto: quien no distinga rojo de verde tiene
 * que poder leer lo mismo.
 */
export function LimiteAportacion({
  socio,
  limite,
  avisoPct,
}: {
  socio: ResumenSocio;
  limite: number;
  avisoPct: number;
}) {
  const pct = porcentaje(socio.anticipado, limite) ?? 0;
  const restante = Math.round((limite - socio.anticipado) * 100) / 100;

  const nivel: "ok" | "aviso" | "superado" =
    pct >= 100 ? "superado" : pct >= avisoPct ? "aviso" : "ok";

  const colorBarra =
    nivel === "superado" ? "bg-danger" : nivel === "aviso" ? "bg-warning" : "bg-success";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">
          {socio.nombre}
        </span>
        <span className="cifra text-sm text-text-secondary">
          {formatearEuros(socio.anticipado)}{" "}
          <span className="text-text-muted">de {formatearEuros(limite)}</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${socio.nombre} ha aportado el ${Math.round(pct)} por ciento del límite acordado`}
        className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          className={cn("h-full rounded-full transition-[width] duration-500", colorBarra)}
        />
      </div>

      <p className="text-sm text-text-secondary">
        <span className="font-medium text-text-primary">{socio.nombre}</span> ha
        aportado{" "}
        <span className="cifra">{formatearEuros(socio.anticipado)}</span> de los{" "}
        <span className="cifra">{formatearEuros(limite)}</span> acordados.{" "}
        {restante > 0 ? (
          <>
            Quedan <span className="cifra">{formatearEuros(restante)}</span>.
          </>
        ) : (
          <>
            Ha superado el límite en{" "}
            <span className="cifra">{formatearEuros(Math.abs(restante))}</span>.
          </>
        )}
      </p>

      {nivel === "aviso" ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-semibold text-warning">Atención. </span>
            Se acerca el límite de aportación acordado. Toca convocar la reunión
            de continuidad prevista en el contrato.
          </span>
        </p>
      ) : null}

      {nivel === "superado" ? (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <span className="font-semibold text-danger">Límite superado. </span>
            El contrato preveía convocar la reunión de continuidad antes de
            llegar aquí. No debería aportarse más sin ese acuerdo.
          </span>
        </p>
      ) : null}
    </div>
  );
}
