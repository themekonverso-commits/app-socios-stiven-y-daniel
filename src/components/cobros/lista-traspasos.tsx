"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
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
import { eliminarTraspaso } from "@/app/acciones/cobros";
import type { Traspaso } from "@/lib/consultas-cobros";
import { formatearEuros, formatearFecha } from "@/lib/formato";

/** Traspasos PayPal → Banco del periodo. Solo el autor puede borrar el suyo. */
export function ListaTraspasos({
  traspasos,
  usuarioId,
}: {
  traspasos: Traspaso[];
  usuarioId: string;
}) {
  const [aBorrar, setABorrar] = useState<Traspaso | null>(null);
  const [borrando, iniciar] = useTransition();

  function borrar(traspaso: Traspaso) {
    iniciar(async () => {
      const resultado = await eliminarTraspaso(traspaso.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Traspaso eliminado.");
      setABorrar(null);
    });
  }

  return (
    <section aria-labelledby="traspasos-titulo" className="flex flex-col gap-2">
      <h2 id="traspasos-titulo" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <ArrowRightLeft aria-hidden="true" className="size-4 text-brand" />
        Traspasos PayPal → Banco
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">Traspasos de PayPal al banco del periodo</caption>
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3 text-right">Sale de PayPal</th>
                <th scope="col" className="px-4 py-3 text-right">Comisión</th>
                <th scope="col" className="px-4 py-3 text-right">Llega al banco</th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {traspasos.map((t) => (
                <tr key={t.id} className="border-b border-border bg-base last:border-b-0 hover:bg-surface">
                  <td className="cifra px-4 py-3 text-text-primary">
                    {formatearFecha(t.fecha)}
                    {t.referencia ? (
                      <span className="block text-xs text-text-muted">{t.referencia}</span>
                    ) : null}
                  </td>
                  <td className="cifra px-4 py-3 text-right text-text-primary">
                    {formatearEuros(t.importe)}
                  </td>
                  <td className="cifra px-4 py-3 text-right text-text-secondary">
                    {t.comision > 0 ? formatearEuros(t.comision) : "—"}
                  </td>
                  <td className="cifra px-4 py-3 text-right font-medium text-text-primary">
                    {formatearEuros(t.importe_neto)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {t.created_by === usuarioId ? (
                      <button
                        type="button"
                        onClick={() => setABorrar(t)}
                        aria-label={`Eliminar el traspaso del ${formatearFecha(t.fecha)}`}
                        className="inline-flex size-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    ) : (
                      <span
                        title={`Lo registró ${t.autor_nombre ?? "el otro socio"}`}
                        className="inline-flex size-11 items-center justify-center text-xs text-text-muted"
                      >
                        {t.autor_nombre?.slice(0, 1) ?? "·"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={aBorrar !== null} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar el traspaso del {aBorrar ? formatearFecha(aBorrar.fecha) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              El dinero vuelve a contar como saldo de PayPal
              {aBorrar && aBorrar.comision > 0 ? " y se borra el gasto de su comisión" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={borrando}
              onClick={(evento) => {
                evento.preventDefault();
                if (aBorrar) borrar(aBorrar);
              }}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
