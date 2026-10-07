"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { crearTraspaso } from "@/app/acciones/cobros";
import { redondear2 } from "@/lib/dinero";
import { formatearEuros } from "@/lib/formato";
import { cn } from "@/lib/utils";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

const CLASE_INPUT =
  "h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand";

/**
 * Traspaso de la cuenta de PayPal al banco.
 *
 * No es ingreso ni gasto: el dinero ya era del negocio y solo cambia de
 * cuenta. Si PayPal cobra por el traspaso, esa comisión sí es gasto, y la
 * genera la base de datos.
 */
export function FormularioTraspaso() {
  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [importe, setImporte] = useState<number | null>(null);
  const [comision, setComision] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [guardando, iniciar] = useTransition();

  const neto = redondear2((importe ?? 0) - (comision ?? 0));

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (importe === null || importe <= 0) {
      toast.error("Escribe el importe que sale de PayPal.");
      return;
    }
    if ((comision ?? 0) >= importe) {
      toast.error("La comisión no puede ser igual o mayor que el traspaso.");
      return;
    }

    iniciar(async () => {
      const resultado = await crearTraspaso({
        fecha,
        importe,
        comision: comision ?? 0,
        referencia: referencia || null,
      });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        (comision ?? 0) > 0
          ? `Traspaso registrado. La comisión de ${formatearEuros(comision ?? 0)} queda como gasto.`
          : "Traspaso registrado. La caja total no cambia.",
      );
      setImporte(null);
      setComision(null);
      setReferencia("");
    });
  }

  return (
    <form onSubmit={enviar}>
      <p className="text-xs text-text-secondary">
        Mueve dinero de la cuenta de PayPal al banco. No es ingreso ni gasto: la caja
        total no cambia. Si PayPal cobra comisión por el traspaso, esa parte sí se
        registra como gasto.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="traspaso-fecha" className="text-xs text-text-secondary">
            Fecha
          </label>
          <SelectorFecha id="traspaso-fecha" valor={fecha} alCambiar={setFecha} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="traspaso-importe" className="text-xs text-text-secondary">
            Sale de PayPal
          </label>
          <CampoImporte id="traspaso-importe" valor={importe} alCambiar={setImporte} sufijo="€" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="traspaso-comision" className="text-xs text-text-secondary">
            Comisión (si la hay)
          </label>
          <CampoImporte id="traspaso-comision" valor={comision} alCambiar={setComision} sufijo="€" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="traspaso-referencia" className="text-xs text-text-secondary">
            Referencia (opcional)
          </label>
          <input
            id="traspaso-referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
        <p className="cifra flex flex-1 flex-wrap items-center gap-2 text-sm text-text-secondary">
          PayPal
          <span className="font-semibold text-text-primary">
            −{formatearEuros(importe ?? 0)}
          </span>
          <ArrowRight aria-hidden="true" className="size-4" />
          Banco
          <span className={cn("font-semibold", neto < 0 ? "text-danger" : "text-text-primary")}>
            +{formatearEuros(neto)}
          </span>
        </p>
        <button
          type="submit"
          disabled={guardando}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
        >
          {guardando ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          Registrar traspaso
        </button>
      </div>
    </form>
  );
}
