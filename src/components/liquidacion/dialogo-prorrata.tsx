"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Calculator, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampoImporte } from "@/components/campos/campo-importe";
import { calcularProrrataAccion, registrarReembolsosProrrata } from "@/app/acciones/prorrata";
import { formatearEuros } from "@/lib/formato";
import type { ResumenSocio } from "@/lib/tipos-liquidacion";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/**
 * R3.2 — reparto a prorrata de la caja disponible.
 *
 * El cálculo lo hace fn_prorrata_reembolso en Postgres. Aquí solo se pide el
 * importe y se enseña el resultado: si la aritmética se hiciera en el
 * navegador, dos socios podrían ver cifras distintas.
 */
export function DialogoProrrata({
  socios,
  alTerminar,
}: {
  socios: ResumenSocio[];
  alTerminar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [disponible, setDisponible] = useState<number | null>(null);
  const [reparto, setReparto] = useState<Record<string, number> | null>(null);
  const [calculando, iniciarCalculo] = useTransition();
  const [registrando, iniciarRegistro] = useTransition();

  const conPendiente = socios.filter((s) => s.pendiente > 0);
  const totalPendiente =
    Math.round(conPendiente.reduce((s, x) => s + x.pendiente, 0) * 100) / 100;

  function calcular() {
    if (!disponible || disponible <= 0) {
      toast.error("Escribe el importe disponible en caja.");
      return;
    }
    iniciarCalculo(async () => {
      const resultado = await calcularProrrataAccion(disponible);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setReparto(resultado.datos ?? {});
    });
  }

  function registrar() {
    if (!reparto) return;
    iniciarRegistro(async () => {
      const resultado = await registrarReembolsosProrrata(iso(new Date()), reparto);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Reembolsos registrados a prorrata.");
      setAbierto(false);
      setReparto(null);
      setDisponible(null);
      alTerminar();
    });
  }

  const nombreDe = (id: string) =>
    socios.find((s) => s.socio_id === id)?.nombre ?? "Socio";
  const colorDe = (id: string) =>
    socios.find((s) => s.socio_id === id)?.color ?? "#6E6E73";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={conPendiente.length === 0}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50"
      >
        <Calculator aria-hidden="true" className="size-4" />
        Calcular reembolso a prorrata
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="border-border bg-surface sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Reembolso a prorrata
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Si la caja no llega para todos, el contrato manda repartir en
              proporción a lo pendiente de cada socio, sin preferencias.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <p className="cifra rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-secondary">
              Pendiente total:{" "}
              <span className="font-semibold text-text-primary">
                {formatearEuros(totalPendiente)}
              </span>
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="prorrata-disponible" className="text-sm font-medium text-text-primary">
                Importe disponible en caja
              </label>
              <CampoImporte
                id="prorrata-disponible"
                valor={disponible}
                alCambiar={(valor) => {
                  setDisponible(valor);
                  setReparto(null);
                }}
                sufijo="€"
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={calcular}
              disabled={calculando}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface disabled:opacity-60"
            >
              {calculando ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Calcular
            </button>

            {reparto ? (
              <div className="rounded-lg border border-border bg-base p-3">
                <p className="text-xs font-medium text-text-primary">
                  Le corresponde a cada socio
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {Object.entries(reparto).map(([id, importe]) => (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: colorDe(id) }}
                        className="size-2.5 shrink-0 rounded-full"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-secondary">
                        {nombreDe(id)}
                      </span>
                      <span className="cifra font-semibold text-text-primary">
                        {formatearEuros(importe)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="min-h-11 rounded-lg px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={registrar}
              disabled={!reparto || registrando}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
            >
              {registrando ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Registrar ambos
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
