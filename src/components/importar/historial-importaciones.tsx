"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Undo2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { deshacerImportacion } from "@/app/acciones/importacion";
import { formatearEntero, formatearEuros, formatearFecha } from "@/lib/formato";
import type { Importacion } from "@/lib/consultas-importacion";

export function HistorialImportaciones({
  importaciones,
}: {
  importaciones: Importacion[];
}) {
  const router = useRouter();
  const [aDeshacer, setADeshacer] = useState<Importacion | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  function deshacer(importacion: Importacion) {
    setADeshacer(null);
    iniciarTransicion(async () => {
      const resultado = await deshacerImportacion(importacion.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        `${formatearEntero(resultado.datos?.borrados ?? 0)} movimientos eliminados.`,
      );
      router.refresh();
    });
  }

  if (importaciones.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
        Todavía no has importado ningún archivo.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Importaciones realizadas</caption>
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="px-3 py-2.5">Archivo</th>
              <th scope="col" className="px-3 py-2.5">Origen</th>
              <th scope="col" className="px-3 py-2.5">Fecha</th>
              <th scope="col" className="px-3 py-2.5 text-right">Importadas</th>
              <th scope="col" className="px-3 py-2.5 text-right">Omitidas</th>
              <th scope="col" className="px-3 py-2.5 text-right">Importe</th>
              <th scope="col" className="px-3 py-2.5">Por</th>
              <th scope="col" className="px-2 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {importaciones.map((fila) => (
              <tr key={fila.id} className="border-b border-border last:border-b-0">
                <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-text-primary">
                  {fila.nombre_archivo}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                    {fila.origen ?? "CSV"}
                  </span>
                </td>
                <td className="cifra px-3 py-2.5 whitespace-nowrap text-text-secondary">
                  {fila.created_at ? formatearFecha(fila.created_at) : "—"}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-success">
                  {formatearEntero(fila.filas_importadas)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-muted">
                  {formatearEntero(fila.filas_omitidas)}
                </td>
                <td className="cifra px-3 py-2.5 text-right font-medium text-text-primary">
                  {formatearEuros(fila.importe_total_eur)}
                </td>
                <td className="px-3 py-2.5 text-text-secondary">{fila.autor || "—"}</td>
                <td className="px-2 py-2.5">
                  {fila.bloqueada ? (
                    // Deshabilitado CON explicación: un botón gris sin motivo
                    // solo genera dudas.
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          role="button"
                          aria-disabled="true"
                          aria-label={`No se puede deshacer. ${fila.motivo_bloqueo ?? ""}`}
                          className="flex size-11 cursor-not-allowed items-center justify-center rounded-lg text-text-muted opacity-50"
                        >
                          <Lock aria-hidden="true" className="size-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        {fila.motivo_bloqueo}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setADeshacer(fila)}
                      disabled={pendiente}
                      aria-label={`Deshacer la importación de ${fila.nombre_archivo}`}
                      className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      <Undo2 aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={aDeshacer !== null}
        onOpenChange={(abierto) => !abierto && setADeshacer(null)}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Deshacer esta importación?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-text-secondary">
                <p>
                  Se borrarán los movimientos que creó. Los que hayas registrado
                  a mano no se tocan.
                </p>
                {aDeshacer ? (
                  <p className="mt-3 rounded-lg border border-border bg-base p-3 text-text-primary">
                    <span className="font-medium">{aDeshacer.nombre_archivo}</span>
                    <br />
                    <span className="cifra text-xs text-text-secondary">
                      {formatearEntero(aDeshacer.filas_importadas)} movimientos ·{" "}
                      {formatearEuros(aDeshacer.importe_total_eur)}
                    </span>
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aDeshacer && deshacer(aDeshacer)}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Deshacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
