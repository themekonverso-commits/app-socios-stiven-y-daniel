import { CircleAlert, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatearEuros } from "@/lib/formato";
import { porcentaje } from "@/lib/kpis";
import type { ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * R6 — cupo de aportación acordado y reunión de continuidad.
 *
 * El cupo NO es «lo máximo que un socio puede adelantar»: es el tope de una
 * tarjeta de crédito destinada en exclusiva a publicidad. Un anticipo de otra
 * categoría —Shopify, Klaviyo, la gestoría— se reembolsa exactamente igual,
 * pero no gasta tarjeta. Por eso la barra mide `anticipado_cupo` y lo demás
 * aparece debajo, dicho con todas las letras: si alguien lee solo la barra no
 * puede acabar creyendo que ese gasto se ha perdido.
 *
 * Verde por debajo del umbral, ámbar al acercarse, rojo al superarlo. El color
 * va acompañado siempre de icono y texto: quien no distinga rojo de verde tiene
 * que poder leer lo mismo.
 */
export function LimiteAportacion({
  socio,
  limite,
  avisoPct,
  ambito,
}: {
  socio: ResumenSocio;
  limite: number;
  avisoPct: number;
  /** Categoría a la que se limita el cupo. Null = cuenta todos los anticipos. */
  ambito: string | null;
}) {
  const consumido = socio.anticipado_cupo;
  const fuera = socio.anticipado_otros;

  const pct = porcentaje(consumido, limite) ?? 0;
  const restante = Math.round((limite - consumido) * 100) / 100;

  const nivel: "ok" | "aviso" | "superado" =
    pct >= 100 ? "superado" : pct >= avisoPct ? "aviso" : "ok";

  const colorBarra =
    nivel === "superado" ? "bg-danger" : nivel === "aviso" ? "bg-warning" : "bg-success";

  // «…acordados para publicidad», en minúscula, dentro de la frase.
  const paraQue = ambito ? ` para ${ambito.toLowerCase()}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">
          {socio.nombre}
        </span>
        <span className="cifra text-sm text-text-secondary">
          {formatearEuros(consumido)}{" "}
          <span className="text-text-muted">de {formatearEuros(limite)}</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${socio.nombre} ha consumido el ${Math.round(pct)} por ciento del cupo acordado${paraQue}`}
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
        <span className="cifra">{formatearEuros(consumido)}</span> de los{" "}
        <span className="cifra">{formatearEuros(limite)}</span> acordados
        {paraQue}.{" "}
        {restante > 0 ? (
          <>
            Quedan <span className="cifra">{formatearEuros(restante)}</span>.
          </>
        ) : (
          <>
            Ha superado el cupo en{" "}
            <span className="cifra">{formatearEuros(Math.abs(restante))}</span>.
          </>
        )}
      </p>

      {ambito && fuera > 0 ? (
        <p className="border-l-2 border-border pl-3 text-sm text-text-muted">
          Además ha anticipado{" "}
          <span className="cifra text-text-secondary">{formatearEuros(fuera)}</span>{" "}
          en otros gastos, reembolsables igualmente. No consumen el cupo.
        </p>
      ) : null}

      {nivel === "aviso" ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-semibold text-warning">Atención. </span>
            Se acerca el cupo acordado{paraQue}. Toca convocar la reunión de
            continuidad prevista en el contrato.
          </span>
        </p>
      ) : null}

      {nivel === "superado" ? (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <span className="font-semibold text-danger">Cupo superado. </span>
            El contrato preveía convocar la reunión de continuidad antes de
            llegar aquí. No debería aportarse más{paraQue} sin ese acuerdo.
          </span>
        </p>
      ) : null}
    </div>
  );
}
