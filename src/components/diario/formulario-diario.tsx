"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { registrarVentaDiaria } from "@/app/acciones/movimientos";
import { formatearEuros } from "@/lib/formato";
import { convertirAEuros } from "@/lib/dinero";
import type { Divisa } from "@/lib/tipos-db";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/**
 * Alta rápida de las ventas del día: el ritual de cada noche.
 * Todo en una línea, con la fecha ya puesta en hoy y el foco en los pedidos.
 */
export function FormularioDiario({
  ultimaTasa,
}: {
  ultimaTasa: { fecha: string; tasa: number } | null;
}) {
  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [pedidos, setPedidos] = useState<string>("");
  const [ingresos, setIngresos] = useState<number | null>(null);
  const [divisa, setDivisa] = useState<Divisa>("EUR");
  const [tasa, setTasa] = useState<number>(ultimaTasa?.tasa ?? 1);
  const [confirmarSobrescribir, setConfirmarSobrescribir] = useState(false);
  const [guardando, iniciarGuardado] = useTransition();

  const pedidosRef = useRef<HTMLInputElement>(null);

  const numPedidos = Number.parseInt(pedidos, 10);
  const pedidosValidos = Number.isFinite(numPedidos) && numPedidos >= 0;

  const equivalente =
    divisa === "USD" && ingresos !== null && tasa > 0
      ? convertirAEuros(ingresos, tasa)
      : null;

  function enviar(sobrescribir: boolean) {
    if (!pedidosValidos) {
      toast.error("Escribe el número de pedidos.");
      pedidosRef.current?.focus();
      return;
    }
    if (ingresos === null || ingresos <= 0) {
      toast.error("Escribe los ingresos del día.");
      return;
    }

    iniciarGuardado(async () => {
      const resultado = await registrarVentaDiaria({
        fecha,
        num_pedidos: numPedidos,
        ingresos,
        divisa,
        tasa_cambio: divisa === "EUR" ? 1 : tasa,
        sobrescribir,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      if (resultado.datos?.duplicado) {
        setConfirmarSobrescribir(true);
        return;
      }

      toast.success(
        sobrescribir ? "Registro del día actualizado." : "Ventas registradas.",
      );
      setPedidos("");
      setIngresos(null);
      pedidosRef.current?.focus();
    });
  }

  return (
    <>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(false);
        }}
        className="rounded-xl border border-border bg-surface p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="diario-fecha" className="text-xs text-text-secondary">
              Fecha
            </label>
            <SelectorFecha id="diario-fecha" valor={fecha} alCambiar={setFecha} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="diario-pedidos" className="text-xs text-text-secondary">
              Nº de pedidos
            </label>
            <input
              id="diario-pedidos"
              ref={pedidosRef}
              type="number"
              min={0}
              inputMode="numeric"
              autoFocus
              value={pedidos}
              onChange={(evento) => setPedidos(evento.target.value)}
              placeholder="0"
              className="cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="diario-ingresos" className="text-xs text-text-secondary">
              Ingresos brutos
            </label>
            <CampoImporte
              id="diario-ingresos"
              valor={ingresos}
              alCambiar={setIngresos}
              sufijo={divisa === "EUR" ? "€" : "$"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-secondary">Divisa</span>
            <SelectorSegmentado
              nombre="diario-divisa"
              etiquetaGrupo="Divisa de las ventas"
              valor={divisa}
              opciones={[
                { valor: "EUR", etiqueta: "EUR" },
                { valor: "USD", etiqueta: "USD" },
              ]}
              alCambiar={(valor) => {
                setDivisa(valor);
                if (valor === "USD" && ultimaTasa) setTasa(ultimaTasa.tasa);
                if (valor === "EUR") setTasa(1);
              }}
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
          >
            {guardando ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Registrar
          </button>
        </div>

        {divisa === "USD" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <label htmlFor="diario-tasa" className="text-xs text-text-secondary">
              Tasa 1 USD =
            </label>
            <input
              id="diario-tasa"
              type="text"
              inputMode="decimal"
              value={String(tasa)}
              onChange={(evento) => {
                const valor = Number(evento.target.value.replace(",", "."));
                setTasa(Number.isFinite(valor) ? valor : 0);
              }}
              className="cifra h-11 w-32 rounded-lg border border-border bg-surface-2 px-3 text-right text-sm text-text-primary outline-none focus-visible:border-brand"
            />
            <span className="text-xs text-text-secondary">EUR</span>
            {equivalente !== null ? (
              <span className="cifra ml-auto text-sm text-text-secondary">
                ≈ {formatearEuros(equivalente)}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      <AlertDialog
        open={confirmarSobrescribir}
        onOpenChange={setConfirmarSobrescribir}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              Ya hay ventas registradas ese día
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Si continúas, el registro existente se sustituye por el nuevo en
              lugar de sumarse. Duplicar las ventas de un día descuadraría toda
              la caja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarSobrescribir(false);
                enviar(true);
              }}
              className="min-h-11 bg-brand text-white hover:bg-brand-hover"
            >
              Sobrescribir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
