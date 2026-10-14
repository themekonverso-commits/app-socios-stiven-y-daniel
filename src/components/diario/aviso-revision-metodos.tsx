"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Info, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { marcarRevisionMetodosHecha } from "@/app/acciones/movimientos";
import type { DiaPorRevisar } from "@/lib/consultas";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Aviso de los días registrados antes del desglose por método de cobro.
 *
 * La migración 0017 los asignó a Shopify Payments, que era lo único que
 * existía. Los que tuvieron ventas por PayPal hay que corregirlos a mano: se
 * vuelve a registrar el día en el formulario con su reparto y se sobrescribe.
 *
 * Esos días son de la tienda que existía entonces: /diario solo pinta el aviso
 * dentro de una tienda con días por revisar (ver obtenerRevisionMetodos).
 */
export function AvisoRevisionMetodos({
  dias,
  nombreTienda,
}: {
  dias: DiaPorRevisar[];
  nombreTienda: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, iniciar] = useTransition();

  function cerrar() {
    iniciar(async () => {
      const resultado = await marcarRevisionMetodosHecha();
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Revisión marcada como hecha.");
    });
  }

  return (
    <section
      aria-labelledby="aviso-metodos-titulo"
      className="rounded-xl border border-warning/40 bg-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <h2 id="aviso-metodos-titulo" className="text-sm font-semibold text-text-primary">
            Revisa {dias.length === 1 ? "1 día" : `${dias.length} días`} de {nombreTienda}{" "}
            de antes del desglose por método de cobro
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Sus ventas se asignaron enteras a Shopify Payments. Si alguno tuvo ventas
            por PayPal, vuelve a registrarlo arriba con su fecha y el reparto real, y
            pulsa «Sobrescribir». El total del día no cambia: solo se reparte.
          </p>

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls="aviso-metodos-lista"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-primary"
          >
            {abierto ? "Ocultar los días" : "Ver los días"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform", abierto && "rotate-180")}
            />
          </button>

          {abierto ? (
            <ul
              id="aviso-metodos-lista"
              className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2"
            >
              {dias.map((dia) => (
                <li
                  key={dia.fecha}
                  className="cifra flex items-center justify-between gap-3 border-b border-border/60 py-1.5"
                >
                  <span className="text-text-primary">{formatearFecha(dia.fecha)}</span>
                  <span className="text-xs text-text-secondary">
                    Shopify {formatearEuros(dia.shopify)}
                    {dia.paypal > 0 ? (
                      <span className="text-success"> · PayPal {formatearEuros(dia.paypal)}</span>
                    ) : (
                      " · PayPal —"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={cerrar}
            disabled={guardando}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            {guardando ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
            Ya los he revisado
          </button>
        </div>
      </div>
    </section>
  );
}
