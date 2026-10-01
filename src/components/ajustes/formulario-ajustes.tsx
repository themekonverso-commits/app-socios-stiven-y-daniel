"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { guardarAjustes } from "@/app/acciones/ajustes";
import { formatearEuros } from "@/lib/formato";
import type { Objetivos, SaldoInicial } from "@/lib/consultas-kpi";

export function FormularioAjustes({
  saldoInicial,
  objetivos,
  saldoActual,
}: {
  saldoInicial: SaldoInicial;
  objetivos: Objetivos;
  saldoActual: number;
}) {
  const [importe, setImporte] = useState<number | null>(saldoInicial.importe);
  const [fecha, setFecha] = useState(saldoInicial.fecha);
  const [facturacion, setFacturacion] = useState<number | null>(objetivos.facturacion);
  const [beneficio, setBeneficio] = useState<number | null>(objetivos.beneficio);
  const [guardando, iniciarGuardado] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    iniciarGuardado(async () => {
      const resultado = await guardarAjustes({
        saldo_importe: importe ?? 0,
        saldo_fecha: fecha,
        objetivo_facturacion: facturacion ?? 0,
        objetivo_beneficio: beneficio ?? 0,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Ajustes guardados.");
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-base font-semibold text-text-primary">Saldo en banco</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          La aplicación no ve tu banco. Dile cuánto había en un día concreto y a
          partir de ahí suma lo que ha pagado Shopify (/cobros) y resta los
          gastos pagados por el negocio y los reembolsos a socios.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="saldo-importe" className="text-sm font-medium text-text-primary">
              Saldo inicial
            </label>
            <CampoImporte
              id="saldo-importe"
              valor={importe}
              alCambiar={setImporte}
              sufijo="€"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="saldo-fecha" className="text-sm font-medium text-text-primary">
              A fecha de
            </label>
            <SelectorFecha id="saldo-fecha" valor={fecha} alCambiar={setFecha} />
          </div>
        </div>

        <p className="cifra mt-4 rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-secondary">
          Saldo en banco hoy con los datos actuales:{" "}
          <span className="font-semibold text-text-primary">
            {formatearEuros(saldoActual)}
          </span>
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-base font-semibold text-text-primary">
          Objetivos mensuales
        </h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Se usan en las barras de progreso de KPIs. Déjalos a cero si todavía no
          quieres fijarlos.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="objetivo-facturacion"
              className="text-sm font-medium text-text-primary"
            >
              Objetivo de facturación
            </label>
            <CampoImporte
              id="objetivo-facturacion"
              valor={facturacion}
              alCambiar={setFacturacion}
              sufijo="€"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="objetivo-beneficio"
              className="text-sm font-medium text-text-primary"
            >
              Objetivo de beneficio
            </label>
            <CampoImporte
              id="objetivo-beneficio"
              valor={beneficio}
              alCambiar={setBeneficio}
              sufijo="€"
            />
          </div>
        </div>
      </section>

      <div>
        <button
          type="submit"
          disabled={guardando}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
        >
          {guardando ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Guardar ajustes
        </button>
      </div>
    </form>
  );
}
