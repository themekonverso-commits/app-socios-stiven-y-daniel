"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CreditCard, TriangleAlert } from "lucide-react";

import { aCupoTarjeta, nivelCupo, type CupoTarjeta } from "@/lib/cupo";
import { COLOR_GENERAL } from "@/lib/ambito";
import { formatearEuros } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type EstadoCanal = "conectando" | "en-vivo" | "sin-conexion";

/**
 * Cupo de la tarjeta de crédito de Daniel (R6). Es global: sale en el
 * dashboard de cualquier tienda, en General y en Todas con el mismo número.
 *
 * Tiempo real: se suscribe a los cambios de `movimientos` (Supabase Realtime,
 * que respeta la RLS). No se fía del contenido del evento: ante cualquier
 * alta, edición o borrado vuelve a pedir `fn_cupo_tarjeta()`, con un pequeño
 * anti-rebote para que una importación de cien filas no lance cien consultas.
 */
export function WidgetTarjeta({ inicial }: { inicial: CupoTarjeta }) {
  const [cupo, setCupo] = useState(inicial);
  const [canal, setCanal] = useState<EstadoCanal>("conectando");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el servidor trae datos nuevos (router.refresh), mandan esos.
  useEffect(() => setCupo(inicial), [inicial]);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    let cancelado = false;

    async function recargar() {
      const { data, error } = await supabase.rpc("fn_cupo_tarjeta");
      if (!cancelado && !error) setCupo(aCupoTarjeta(data));
    }

    function programar() {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(recargar, 400);
    }

    let suscripcion: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Realtime necesita el token del socio para aplicar la RLS.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelado) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      suscripcion = supabase
        .channel("cupo-tarjeta")
        .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, programar)
        .subscribe((estado) => {
          if (cancelado) return;
          if (estado === "SUBSCRIBED") {
            setCanal("en-vivo");
            // Lo que haya cambiado mientras se conectaba.
            programar();
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
            setCanal("sin-conexion");
          }
        });
    })();

    return () => {
      cancelado = true;
      if (temporizador.current) clearTimeout(temporizador.current);
      if (suscripcion) supabase.removeChannel(suscripcion);
    };
  }, []);

  const nivel = nivelCupo(cupo);
  const pct = cupo.pct ?? 0;
  const colorBarra =
    nivel === "superado" ? "bg-danger" : nivel === "aviso" ? "bg-warning" : "bg-success";
  const titular = cupo.socio_nombre ?? "Daniel";

  return (
    <section
      aria-labelledby="widget-tarjeta-titulo"
      data-realtime={canal}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-text-secondary"
          >
            <CreditCard className="size-4.5" />
          </span>
          <div>
            <h2 id="widget-tarjeta-titulo" className="text-sm font-semibold text-text-primary">
              Tarjeta de crédito de {titular}
            </h2>
            <p className="text-xs text-text-muted">Cupo de la sociedad, todas las tiendas</p>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 text-[11px] text-text-muted"
          title={
            canal === "en-vivo"
              ? "Se actualiza solo cuando cualquiera de los dos registra un gasto"
              : canal === "conectando"
                ? "Conectando…"
                : "Sin conexión en tiempo real: recarga la página para ver lo último"
          }
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              canal === "en-vivo" ? "animate-pulse bg-success" : canal === "conectando" ? "bg-warning" : "bg-text-muted",
            )}
          />
          {canal === "en-vivo" ? "En vivo" : canal === "conectando" ? "Conectando" : "Sin conexión"}
        </span>
      </header>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-text-secondary">
          <span className="cifra text-2xl font-semibold text-text-primary">
            {formatearEuros(cupo.consumido)}
          </span>{" "}
          <span className="cifra">/ {formatearEuros(cupo.limite)}</span>
        </p>
        <p className="text-sm text-text-secondary">
          Disponible{" "}
          <span
            className={cn(
              "cifra font-semibold",
              cupo.disponible < 0 ? "text-danger" : "text-text-primary",
            )}
          >
            {formatearEuros(cupo.disponible)}
          </span>
        </p>
      </div>

      <div className="relative">
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Consumido el ${Math.round(pct)} % del cupo de la tarjeta`}
          className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            className={cn("h-full rounded-full transition-[width] duration-500", colorBarra)}
          />
        </div>
        {/* Marca del umbral ámbar. */}
        <span
          aria-hidden="true"
          className="absolute top-[-3px] h-[18px] w-px bg-text-muted"
          style={{ left: `${Math.min(100, cupo.aviso_pct)}%` }}
        />
        <div className="mt-1 flex justify-between text-[11px] text-text-muted">
          <span className="cifra">{Math.round(pct)} %</span>
          <span className="cifra">aviso al {cupo.aviso_pct} %</span>
        </div>
      </div>

      {nivel === "aviso" ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-semibold text-warning">Atención. </span>
            La tarjeta se acerca al cupo acordado. Toca convocar la reunión de continuidad.
          </span>
        </p>
      ) : null}
      {nivel === "superado" ? (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <span className="font-semibold text-danger">Cupo superado. </span>
            No debería cargarse más a la tarjeta sin el acuerdo de la reunión de continuidad.
          </span>
        </p>
      ) : null}

      <div className="border-t border-border pt-3">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
          Consumo por tienda
        </h3>
        {cupo.por_tienda.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no hay gastos con la tarjeta.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {cupo.por_tienda.map((t) => (
              <li key={t.tienda_id ?? "general"} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color ?? COLOR_GENERAL }}
                />
                <span className="min-w-0 flex-1 truncate text-text-secondary">{t.nombre}</span>
                <span className="cifra text-text-primary">{formatearEuros(t.consumido)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
