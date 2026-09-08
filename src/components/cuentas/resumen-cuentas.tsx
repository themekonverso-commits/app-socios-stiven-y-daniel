import { CalendarClock, CreditCard, Users, Wallet } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { ResumenCuentas } from "@/lib/tipos-cuentas";

/**
 * Las cuatro cifras que resumen el inventario.
 *
 * La cuarta —el reparto por titular— no es un adorno: si todas las cuentas
 * están a nombre de uno, eso es un riesgo del negocio y conviene verlo cada vez
 * que se entra aquí.
 */
export function ResumenCuentasCabecera({ resumen }: { resumen: ResumenCuentas }) {
  const proxima = resumen.proxima;
  const dias = proxima?.dias_para_renovar ?? null;

  const valorProxima = !proxima
    ? "—"
    : dias === null
      ? formatearFecha(String(proxima.fecha_renovacion))
      : dias < 0
        ? `Hace ${Math.abs(dias)} d`
        : dias === 0
          ? "Hoy"
          : `En ${dias} d`;

  const inactivas = resumen.pausadas + resumen.canceladas;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        destacada
        icono={Wallet}
        titulo="Coste mensual"
        subtitulo="Suscripciones activas"
        valor={formatearEuros(resumen.costeMensual)}
        nota={`${formatearEuros(resumen.costeAnual)} al año`}
      />

      <KpiCard
        icono={CreditCard}
        titulo="Cuentas activas"
        subtitulo="En el inventario"
        valor={String(resumen.activas)}
        nota={
          inactivas === 0
            ? "Ninguna pausada ni cancelada"
            : `${resumen.pausadas} pausada${resumen.pausadas === 1 ? "" : "s"} · ${resumen.canceladas} cancelada${resumen.canceladas === 1 ? "" : "s"}`
        }
      />

      <KpiCard
        icono={CalendarClock}
        titulo="Próxima renovación"
        subtitulo={proxima?.nombre ?? "Ninguna programada"}
        valor={valorProxima}
        claseValor={
          dias !== null && dias < 0
            ? "text-danger"
            : dias !== null && dias <= (proxima?.aviso_dias ?? 7)
              ? "text-warning"
              : "text-text-primary"
        }
        nota={
          proxima?.fecha_renovacion
            ? formatearFecha(String(proxima.fecha_renovacion))
            : undefined
        }
      />

      <article className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
          >
            <Users className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              Reparto por titular
            </h3>
            <p className="truncate text-xs text-text-secondary">
              A nombre de quién está cada cuenta
            </p>
          </div>
        </div>

        {resumen.porTitular.length === 0 ? (
          <p className="mt-5 text-sm text-text-secondary">
            Todavía no hay cuentas activas.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {resumen.porTitular.map((fila) => (
              <li key={fila.socio_id} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: fila.color ?? "#6E6E73" }}
                  className="size-2.5 shrink-0 rounded-full"
                />
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {fila.nombre}
                </span>
                <span className="cifra shrink-0 font-medium text-text-primary">
                  {fila.cuentas}
                </span>
                <span className="cifra w-20 shrink-0 text-right text-xs text-text-muted">
                  {formatearEuros(fila.costeMensual)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
