import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  Coins,
  HandCoins,
  PiggyBank,
  Receipt,
  TrendingDown,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatearEuros } from "@/lib/formato";
import type { EstadoLiquidacion } from "@/lib/tipos-liquidacion";

type EstadoPaso = "cubierto" | "en-curso" | "bloqueado" | "ninguno";

type Paso = {
  numero: number;
  icono: LucideIcon;
  etiqueta: string;
  detalle: string;
  importe: number | null;
  estado: EstadoPaso;
};

const PRESENTACION: Record<
  EstadoPaso,
  { texto: string; clase: string; Icono: LucideIcon; claseFila: string }
> = {
  cubierto: {
    texto: "cubierto",
    clase: "text-success",
    Icono: Check,
    claseFila: "border-success/30",
  },
  "en-curso": {
    texto: "pendiente",
    clase: "text-brand",
    Icono: Clock,
    claseFila: "border-brand/40 bg-brand-soft",
  },
  bloqueado: {
    texto: "bloqueado",
    clase: "text-text-muted",
    Icono: Ban,
    claseFila: "border-border opacity-60",
  },
  ninguno: {
    texto: "ninguna",
    clase: "text-success",
    Icono: Check,
    claseFila: "border-success/30",
  },
};

/**
 * R3 — orden de prelación de los ingresos, paso a paso.
 *
 * Es la pantalla que evita la discusión: enseña por qué se puede o no repartir
 * sin que nadie tenga que fiarse de la palabra del otro. Los estados no salen
 * de aquí: los decide fn_estado_liquidacion en Postgres.
 */
export function CascadaPrelacion({ estado }: { estado: EstadoLiquidacion }) {
  const gastosCubiertos = estado.ingresos_acumulados >= estado.gastos_acumulados;
  const hayAnticipos = estado.total_pendiente_reembolso > 0;
  const hayPerdidas = estado.perdidas_acumuladas > 0;

  const pasos: Paso[] = [
    {
      numero: 1,
      icono: Receipt,
      etiqueta: "Gastos corrientes del periodo",
      detalle: gastosCubiertos
        ? "Los ingresos del periodo los cubren."
        : "Los ingresos del periodo no llegan a cubrirlos.",
      importe: -estado.gastos_acumulados,
      estado: gastosCubiertos ? "cubierto" : "en-curso",
    },
    {
      numero: 2,
      icono: HandCoins,
      etiqueta: "Reembolso de anticipos",
      detalle: hayAnticipos
        ? "A prorrata entre los socios, sin preferencias."
        : "No queda nada por devolver a los socios.",
      importe: hayAnticipos ? -estado.total_pendiente_reembolso : 0,
      estado: hayAnticipos ? "en-curso" : "ninguno",
    },
    {
      numero: 3,
      icono: TrendingDown,
      etiqueta: "Pérdidas acumuladas",
      detalle: hayPerdidas
        ? "Se compensan antes de repartir nada."
        : "No hay pérdidas que compensar.",
      importe: hayPerdidas ? -estado.perdidas_acumuladas : 0,
      estado: hayPerdidas ? (hayAnticipos ? "bloqueado" : "en-curso") : "ninguno",
    },
    {
      numero: 4,
      icono: PiggyBank,
      etiqueta: "Reinversión acordada",
      detalle: estado.en_fase_inicial
        ? "Fase Inicial: el contrato fija el 100 %."
        : "Según lo acordado en la reunión trimestral.",
      importe: estado.puede_repartir ? null : null,
      estado: estado.puede_repartir ? "en-curso" : "bloqueado",
    },
    {
      numero: 5,
      icono: Users,
      etiqueta: "Reparto entre socios",
      detalle: estado.puede_repartir
        ? "Al 50 % para cada uno."
        : "Bloqueado por los pasos anteriores.",
      importe: null,
      estado: estado.puede_repartir ? "en-curso" : "bloqueado",
    },
  ];

  const mitad = Math.round((estado.base_distribuible / 2) * 100) / 100;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {pasos.map((paso) => {
          const p = PRESENTACION[paso.estado];
          const IconoPaso = paso.icono;
          const IconoEstado = p.Icono;

          return (
            <li
              key={paso.numero}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3",
                p.claseFila,
              )}
            >
              <span
                aria-hidden="true"
                className="cifra flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold text-text-secondary"
              >
                {paso.numero}
              </span>

              <IconoPaso
                aria-hidden="true"
                className={cn("size-4 shrink-0", p.clase)}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {paso.etiqueta}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {paso.detalle}
                </p>
              </div>

              <span className="cifra shrink-0 text-sm font-medium text-text-primary">
                {paso.importe === null ? "—" : formatearEuros(paso.importe)}
              </span>

              {/* El estado va con icono Y palabra: el color no puede ser el
                  único indicador. */}
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 text-xs font-medium",
                  p.clase,
                )}
              >
                <IconoEstado aria-hidden="true" className="size-3.5" />
                {p.texto}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Veredicto */}
      {estado.puede_repartir ? (
        <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
          <Coins aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">
              Hay {formatearEuros(estado.base_distribuible)} repartibles.
            </p>
            <p className="cifra mt-0.5 text-sm text-text-secondary">
              {formatearEuros(mitad)} para cada socio, según la Regla 1 del
              contrato.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">
              Aún no se puede repartir
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {estado.motivo_bloqueo}
            </p>

            {estado.motivos_bloqueo.length > 1 ? (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-text-secondary">
                {estado.motivos_bloqueo.slice(1).map((motivo) => (
                  <li key={motivo}>{motivo}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      {/* Las cifras que sostienen la cascada, para que nada sea opaco. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { etiqueta: "Ingresos", valor: estado.ingresos_acumulados },
          { etiqueta: "Gastos", valor: estado.gastos_acumulados },
          { etiqueta: "Resultado", valor: estado.resultado_acumulado },
          { etiqueta: "Caja disponible", valor: estado.caja_disponible },
        ].map((celda) => (
          <div
            key={celda.etiqueta}
            className="rounded-lg border border-border bg-base p-3"
          >
            <dt className="text-xs text-text-secondary">{celda.etiqueta}</dt>
            <dd className="cifra mt-1 text-base font-semibold text-text-primary">
              {formatearEuros(celda.valor)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
