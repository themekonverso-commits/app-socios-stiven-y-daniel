"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { aplazarRenovacion, registrarPagoCuenta } from "@/app/acciones/cuentas";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { CuentaConCoste } from "@/lib/tipos-cuentas";

/**
 * Franja de avisos. Solo aparece si hay algo que renovar: un bloque vacío
 * permanente se deja de mirar a las dos semanas.
 */
export function AvisosRenovacion({
  vencidas,
  proximas,
}: {
  vencidas: CuentaConCoste[];
  proximas: CuentaConCoste[];
}) {
  if (vencidas.length === 0 && proximas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {vencidas.length > 0 ? (
        <Bloque
          nivel="vencida"
          titulo={`${vencidas.length} cuenta${vencidas.length === 1 ? "" : "s"} con la renovación vencida`}
          cuentas={vencidas}
        />
      ) : null}

      {proximas.length > 0 ? (
        <Bloque
          nivel="proxima"
          titulo={`${proximas.length} cuenta${proximas.length === 1 ? "" : "s"} renueva${proximas.length === 1 ? "" : "n"} pronto`}
          cuentas={proximas}
        />
      ) : null}
    </div>
  );
}

function Bloque({
  nivel,
  titulo,
  cuentas,
}: {
  nivel: "vencida" | "proxima";
  titulo: string;
  cuentas: CuentaConCoste[];
}) {
  const esVencida = nivel === "vencida";
  const Icono = esVencida ? CircleAlert : TriangleAlert;

  return (
    <section
      className={cn(
        "rounded-xl border p-4",
        esVencida
          ? "border-danger/40 bg-danger/10"
          : "border-warning/40 bg-warning/10",
      )}
    >
      <h2
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          esVencida ? "text-danger" : "text-warning",
        )}
      >
        <Icono aria-hidden="true" className="size-4" />
        {titulo}
      </h2>

      <ul className="mt-3 flex flex-col gap-2">
        {cuentas.map((cuenta) => (
          <FilaAviso key={cuenta.id} cuenta={cuenta} esVencida={esVencida} />
        ))}
      </ul>
    </section>
  );
}

function FilaAviso({
  cuenta,
  esVencida,
}: {
  cuenta: CuentaConCoste;
  esVencida: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [accion, setAccion] = useState<"pago" | "aplazar" | null>(null);

  const dias = cuenta.dias_para_renovar ?? 0;

  function pagar() {
    setAccion("pago");
    iniciarTransicion(async () => {
      const resultado = await registrarPagoCuenta(String(cuenta.id));
      setAccion(null);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      // El toast confirma las DOS cosas que han pasado, no solo el gasto.
      const datos = resultado.datos;
      toast.success(
        datos?.renovacion_avanzada && datos.fecha_renovacion
          ? `Gasto de ${formatearEuros(datos.importe_eur)} registrado. La renovación pasa al ${formatearFecha(datos.fecha_renovacion)}.`
          : `Gasto de ${formatearEuros(datos?.importe_eur ?? 0)} registrado.`,
      );
      router.refresh();
    });
  }

  function aplazar() {
    setAccion("aplazar");
    iniciarTransicion(async () => {
      const resultado = await aplazarRenovacion(String(cuenta.id), 30);
      setAccion(null);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Renovación aplazada 30 días.");
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-base p-3">
      <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-text-muted" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {cuenta.nombre}
        </p>
        <p className="cifra truncate text-xs text-text-secondary">
          {cuenta.fecha_renovacion ? formatearFecha(String(cuenta.fecha_renovacion)) : "—"}
          {" · "}
          {esVencida
            ? `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`
            : dias === 0
              ? "renueva hoy"
              : `en ${dias} día${dias === 1 ? "" : "s"}`}
        </p>
      </div>

      <span className="cifra shrink-0 text-sm font-medium text-text-primary">
        {formatearEuros(Number(cuenta.coste_eur ?? 0))}
      </span>

      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={pagar}
          disabled={pendiente}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pendiente && accion === "pago" ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          ) : null}
          Registrar pago
        </button>
        <button
          type="button"
          onClick={aplazar}
          disabled={pendiente}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
        >
          {pendiente && accion === "aplazar" ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          ) : null}
          Aplazar 30 días
        </button>
      </div>
    </li>
  );
}
