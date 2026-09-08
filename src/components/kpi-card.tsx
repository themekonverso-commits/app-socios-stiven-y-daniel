import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SinHistorico } from "@/components/dashboard/sin-historico";
import { cn } from "@/lib/utils";
import { formatearVariacion } from "@/lib/formato";

export type KpiCardProps = {
  titulo: string;
  subtitulo?: string;
  /** Valor ya formateado en español, o "—" cuando no hay dato. */
  valor: string;
  /**
   * Variación porcentual. `null` significa que NO se puede calcular (el
   * periodo anterior es cero): se pinta un guion con su explicación, nunca un
   * porcentaje inventado.
   */
  variacion?: number | null;
  /** Contexto de la variación: «vs. mes anterior». */
  etiquetaVariacion?: string;
  /**
   * En los gastos, subir es empeorar. Sin esto un mes con un 40 % más de gasto
   * publicitario se pintaría de verde.
   */
  sentidoVariacion?: "mas-es-mejor" | "menos-es-mejor";
  /** Color del valor grande, para umbrales (ROAS) o signo (beneficio). */
  claseValor?: string;
  /** Nota bajo el valor: umbral alcanzado, aclaración… */
  nota?: string;
  enlace?: { href: string; texto: string };
  icono?: LucideIcon;
  /** Solo UNA por pantalla, y siempre la primera del grid. */
  destacada?: boolean;
  className?: string;
};

export function KpiCard({
  titulo,
  subtitulo,
  valor,
  variacion,
  etiquetaVariacion,
  sentidoVariacion = "mas-es-mejor",
  claseValor,
  nota,
  enlace,
  icono: Icono,
  destacada = false,
  className,
}: KpiCardProps) {
  const tieneVariacion = typeof variacion === "number";
  const sube = tieneVariacion && variacion > 0;
  const baja = tieneVariacion && variacion < 0;

  const mejora = !tieneVariacion
    ? null
    : sentidoVariacion === "mas-es-mejor"
      ? variacion > 0
      : variacion < 0;

  const IconoTendencia = baja ? TrendingDown : TrendingUp;

  const claseTendencia = destacada
    ? "text-white"
    : mejora === null
      ? "text-text-secondary"
      : mejora
        ? "text-success"
        : "text-danger";

  return (
    <Card
      data-destacada={destacada}
      className={cn(
        "gap-0 rounded-xl p-5 shadow-none ring-0 transition-colors",
        destacada
          ? "bg-linear-to-br from-brand to-[#c9400f] text-white"
          : "border border-border bg-surface text-text-primary hover:bg-surface-2",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icono ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              destacada ? "bg-white/20" : "bg-brand-soft text-brand",
            )}
          >
            <Icono className="size-5" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "truncate text-sm font-semibold",
              destacada ? "text-white" : "text-text-primary",
            )}
          >
            {titulo}
          </h3>
          {subtitulo ? (
            <p
              className={cn(
                "truncate text-xs",
                destacada ? "text-white/90" : "text-text-secondary",
              )}
            >
              {subtitulo}
            </p>
          ) : null}
        </div>
      </div>

      <p
        className={cn(
          "cifra mt-5 text-3xl leading-none font-semibold tracking-tight",
          destacada ? "text-white" : (claseValor ?? "text-text-primary"),
        )}
      >
        {valor}
      </p>

      {nota ? (
        <p
          className={cn(
            "mt-1.5 text-xs",
            destacada ? "text-white/90" : "text-text-secondary",
          )}
        >
          {nota}
        </p>
      ) : null}

      {variacion !== undefined ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs">
          {tieneVariacion ? (
            <>
              {/* El icono y el signo acompañan al color: el color nunca es el
                  único indicador de si sube o baja. */}
              <IconoTendencia
                aria-hidden="true"
                className={cn("size-3.5", claseTendencia)}
              />
              <span className={cn("cifra font-medium", claseTendencia)}>
                {formatearVariacion(variacion)}
              </span>
            </>
          ) : (
            <SinHistorico claro={destacada} />
          )}
          {etiquetaVariacion ? (
            <span className={destacada ? "text-white/90" : "text-text-secondary"}>
              {etiquetaVariacion}
            </span>
          ) : null}
          {/* Refuerzo textual para lectores de pantalla. */}
          {tieneVariacion ? (
            <span className="sr-only">
              {sube ? "sube" : baja ? "baja" : "sin cambio"}
            </span>
          ) : null}
        </p>
      ) : null}

      {enlace ? (
        <Link
          href={enlace.href}
          className={cn(
            "mt-4 -mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
            destacada
              ? "text-white hover:text-white/80"
              : "text-brand hover:text-brand-hover",
          )}
        >
          {enlace.texto}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </Card>
  );
}
