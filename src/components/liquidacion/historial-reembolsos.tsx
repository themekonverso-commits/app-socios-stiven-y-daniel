"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Undo2 } from "lucide-react";
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
import { anularReembolso } from "@/app/acciones/liquidacion";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha, mayusculaInicial } from "@/lib/formato";
import type { ReembolsoHistorial } from "@/lib/tipos-liquidacion";

export function HistorialReembolsos({
  reembolsos,
}: {
  reembolsos: ReembolsoHistorial[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [aAnular, setAAnular] = useState<ReembolsoHistorial | null>(null);
  const [anulando, iniciarAnulacion] = useTransition();

  function anular(reembolso: ReembolsoHistorial) {
    setAAnular(null);
    iniciarAnulacion(async () => {
      const resultado = await anularReembolso(reembolso.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Reembolso anulado. Los anticipos vuelven a estar pendientes.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-text-primary">
          Historial de reembolsos
        </span>
        <span className="cifra text-xs text-text-muted">
          {reembolsos.length}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto size-4 text-text-muted transition-transform",
            abierto && "rotate-180",
          )}
        />
      </button>

      {abierto ? (
        reembolsos.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-sm text-text-secondary">
            Todavía no se ha registrado ningún reembolso.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Reembolsos registrados</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                  <th scope="col" className="px-4 py-2.5">Fecha</th>
                  <th scope="col" className="px-4 py-2.5">Socio</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Importe</th>
                  <th scope="col" className="px-4 py-2.5">Método</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Anticipos</th>
                  <th scope="col" className="px-4 py-2.5">Registrado por</th>
                  <th scope="col" className="px-2 py-2.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reembolsos.map((reembolso) => (
                  <tr key={reembolso.id} className="border-b border-border last:border-b-0">
                    <td className="cifra px-4 py-2.5 whitespace-nowrap text-text-secondary">
                      {formatearFecha(reembolso.fecha)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-text-primary">
                        <span
                          aria-hidden="true"
                          style={{ backgroundColor: reembolso.socio_color ?? "#6E6E73" }}
                          className="size-2 shrink-0 rounded-full"
                        />
                        {reembolso.socio}
                      </span>
                    </td>
                    <td className="cifra px-4 py-2.5 text-right font-medium text-success">
                      {formatearEuros(reembolso.importe_eur)}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {reembolso.metodo ? mayusculaInicial(reembolso.metodo) : "—"}
                    </td>
                    <td className="cifra px-4 py-2.5 text-right text-text-secondary">
                      {reembolso.num_anticipos}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {reembolso.registrado_por}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => setAAnular(reembolso)}
                        disabled={anulando}
                        aria-label={`Anular el reembolso de ${formatearEuros(reembolso.importe_eur)} a ${reembolso.socio}`}
                        className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        <Undo2 aria-hidden="true" className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <AlertDialog
        open={aAnular !== null}
        onOpenChange={(valor) => !valor && setAAnular(null)}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Anular este reembolso?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-text-secondary">
                <p>
                  Los anticipos que cubría volverán a figurar como pendientes de
                  cobro, y las cifras de la liquidación cambiarán.
                </p>
                {aAnular ? (
                  <p className="mt-3 rounded-lg border border-border bg-base p-3 text-text-primary">
                    <span className="cifra font-semibold">
                      {formatearEuros(aAnular.importe_eur)}
                    </span>{" "}
                    a {aAnular.socio}
                    <br />
                    <span className="cifra text-xs text-text-secondary">
                      {formatearFecha(aAnular.fecha)} ·{" "}
                      {aAnular.num_anticipos} anticipo
                      {aAnular.num_anticipos === 1 ? "" : "s"}
                    </span>
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aAnular && anular(aAnular)}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Anular reembolso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
