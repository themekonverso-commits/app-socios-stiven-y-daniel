"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, LoaderCircle, Target } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { useHrefConTienda } from "@/components/tiendas/proveedor-tiendas";
import { guardarAjustes } from "@/app/acciones/ajustes";
import { formatearEuros } from "@/lib/formato";
import type { SaldoInicial } from "@/lib/consultas-kpi";
import type { CupoTarjeta } from "@/lib/cupo";

/**
 * Ajustes de la sociedad (globales, iguales en todas las tiendas): saldos de
 * partida del banco y de PayPal. Los objetivos mensuales se fijan en cada
 * tienda, en /tiendas; el cupo de la tarjeta se enseña aquí solo de lectura.
 */
export function FormularioAjustes({
  saldoInicial,
  saldoInicialPaypal,
  saldoActual,
  saldoPaypalActual,
  cupo,
}: {
  saldoInicial: SaldoInicial;
  saldoInicialPaypal: SaldoInicial;
  saldoActual: number;
  saldoPaypalActual: number;
  cupo: CupoTarjeta;
}) {
  const conTienda = useHrefConTienda();
  const [importe, setImporte] = useState<number | null>(saldoInicial.importe);
  const [fecha, setFecha] = useState(saldoInicial.fecha);
  const [importePaypal, setImportePaypal] = useState<number | null>(
    saldoInicialPaypal.importe,
  );
  const [fechaPaypal, setFechaPaypal] = useState(saldoInicialPaypal.fecha);
  const [guardando, iniciarGuardado] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    iniciarGuardado(async () => {
      const resultado = await guardarAjustes({
        saldo_importe: importe ?? 0,
        saldo_fecha: fecha,
        paypal_importe: importePaypal ?? 0,
        paypal_fecha: fechaPaypal,
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
          partir de ahí suma lo que ha pagado Shopify Payments (/cobros) y los
          traspasos desde PayPal, y resta los gastos y reembolsos pagados desde
          el banco.
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
        <h2 className="text-base font-semibold text-text-primary">Saldo en PayPal</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Igual que el del banco, para la cuenta de PayPal. A partir de esa fecha
          suma los cobros de PayPal (/cobros) y resta los traspasos al banco y los
          gastos y reembolsos pagados desde PayPal.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paypal-importe" className="text-sm font-medium text-text-primary">
              Saldo inicial
            </label>
            <CampoImporte
              id="paypal-importe"
              valor={importePaypal}
              alCambiar={setImportePaypal}
              sufijo="€"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="paypal-fecha" className="text-sm font-medium text-text-primary">
              A fecha de
            </label>
            <SelectorFecha id="paypal-fecha" valor={fechaPaypal} alCambiar={setFechaPaypal} />
          </div>
        </div>

        <p className="cifra mt-4 rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-secondary">
          Saldo en PayPal hoy con los datos actuales:{" "}
          <span className="font-semibold text-text-primary">
            {formatearEuros(saldoPaypalActual)}
          </span>
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-secondary"
          >
            <CreditCard className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              Cupo de la tarjeta de {cupo.socio_nombre ?? "Daniel"}
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Cuenta todos los gastos pagados con la tarjeta, de cualquier tienda y de
              General. Ya no depende de la categoría.
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-base px-3 py-2">
            <dt className="text-xs text-text-secondary">Cupo acordado</dt>
            <dd className="cifra mt-0.5 font-semibold text-text-primary">
              {formatearEuros(cupo.limite)}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-base px-3 py-2">
            <dt className="text-xs text-text-secondary">Titular</dt>
            <dd className="mt-0.5 font-semibold text-text-primary">
              {cupo.socio_nombre ?? "Sin asignar"}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-base px-3 py-2">
            <dt className="text-xs text-text-secondary">Aviso a partir de</dt>
            <dd className="cifra mt-0.5 font-semibold text-text-primary">
              {cupo.aviso_pct} %
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
          >
            <Target className="size-4.5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Objetivos mensuales</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Ahora son de cada tienda: cada una tiene su objetivo de facturación y de
              beneficio. En «Todas» se suman.
            </p>
          </div>
        </div>
        <Link
          href={conTienda("/tiendas")}
          className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
        >
          Editarlos en Tiendas
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
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
