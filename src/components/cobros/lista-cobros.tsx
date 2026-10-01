"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Trash2, TriangleAlert } from "lucide-react";
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
import { eliminarCobro } from "@/app/acciones/cobros";
import { conciliar, mensajeConciliacion } from "@/lib/cobros";
import type { CobroConciliado } from "@/lib/consultas-cobros";
import { formatearEuros, formatearFecha, formatearPorcentaje } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Cobros del periodo con su conciliación contra /diario.
 *
 * El descuadre se escribe entero en la fila, no solo con un icono: «faltan
 * 15,00 €» es lo que hay que ir a corregir, y el color nunca es el único
 * indicador.
 */
export function ListaCobros({
  cobros,
  usuarioId,
}: {
  cobros: CobroConciliado[];
  usuarioId: string;
}) {
  const [aBorrar, setABorrar] = useState<CobroConciliado | null>(null);
  const [borrando, iniciarBorrado] = useTransition();

  function borrar(cobro: CobroConciliado) {
    iniciarBorrado(async () => {
      const resultado = await eliminarCobro(cobro.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Cobro eliminado, junto con sus gastos generados.");
      setABorrar(null);
    });
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <caption className="sr-only">Cobros de la pasarela del periodo</caption>
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                <th scope="col" className="px-4 py-3">Llegó</th>
                <th scope="col" className="px-4 py-3">Ventas del</th>
                <th scope="col" className="px-4 py-3 text-right">Bruto</th>
                <th scope="col" className="px-4 py-3 text-right">Comisiones</th>
                <th scope="col" className="px-4 py-3 text-right">Neto</th>
                <th scope="col" className="px-4 py-3 text-right">% comisión</th>
                <th scope="col" className="px-4 py-3">Conciliación</th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cobros.map((cobro) => {
                const c = conciliar(cobro.importe_bruto, cobro.ventas_registradas);
                const mio = cobro.created_by === usuarioId;
                const ajustes = cobro.devoluciones !== 0 || cobro.otros_ajustes !== 0;

                return (
                  <tr
                    key={cobro.id}
                    className="border-b border-border bg-base align-top last:border-b-0 hover:bg-surface"
                  >
                    <td className="cifra px-4 py-3 text-text-primary">
                      {formatearFecha(cobro.fecha_cobro)}
                      <span className="block text-xs text-text-muted">
                        {cobro.plataforma}
                        {cobro.referencia ? ` · ${cobro.referencia}` : ""}
                      </span>
                    </td>
                    <td className="cifra px-4 py-3 text-text-secondary">
                      {cobro.periodo_desde === cobro.periodo_hasta
                        ? formatearFecha(cobro.periodo_desde)
                        : `${formatearFecha(cobro.periodo_desde)} – ${formatearFecha(cobro.periodo_hasta)}`}
                    </td>
                    <td className="cifra px-4 py-3 text-right text-text-primary">
                      {formatearEuros(cobro.importe_bruto)}
                    </td>
                    <td className="cifra px-4 py-3 text-right text-text-secondary">
                      {formatearEuros(cobro.comisiones)}
                      {ajustes ? (
                        <span className="block text-xs text-text-muted">
                          {cobro.devoluciones !== 0
                            ? `Devol. ${formatearEuros(cobro.devoluciones)}`
                            : null}
                          {cobro.devoluciones !== 0 && cobro.otros_ajustes !== 0 ? " · " : null}
                          {cobro.otros_ajustes !== 0
                            ? `Ajustes ${formatearEuros(cobro.otros_ajustes)}`
                            : null}
                        </span>
                      ) : null}
                    </td>
                    <td className="cifra px-4 py-3 text-right font-medium text-text-primary">
                      {formatearEuros(cobro.importe_neto)}
                    </td>
                    <td className="cifra px-4 py-3 text-right text-text-secondary">
                      {cobro.pct_comision === null
                        ? "—"
                        : formatearPorcentaje(cobro.pct_comision, 2)}
                    </td>
                    <td className="px-4 py-3">
                      {c.cuadra ? (
                        <span className="inline-flex items-center gap-1.5 text-success">
                          <CircleCheck aria-hidden="true" className="size-4" />
                          Cuadra
                        </span>
                      ) : (
                        <span className="flex max-w-72 items-start gap-1.5 text-warning">
                          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          <span>
                            <span className="font-medium">Descuadre</span>
                            <span className="block text-xs text-text-secondary">
                              {mensajeConciliacion(c, cobro.plataforma)}
                            </span>
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {mio ? (
                        <button
                          type="button"
                          onClick={() => setABorrar(cobro)}
                          aria-label={`Eliminar el cobro del ${formatearFecha(cobro.fecha_cobro)}`}
                          className="inline-flex size-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              className={cn(
                                "inline-flex size-11 items-center justify-center rounded-lg text-xs text-text-muted",
                              )}
                            >
                              {cobro.autor_nombre?.slice(0, 1) ?? "·"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Lo registró {cobro.autor_nombre ?? "el otro socio"}. Solo él puede
                            eliminarlo.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={aBorrar !== null} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar el cobro del {aBorrar ? formatearFecha(aBorrar.fecha_cobro) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Se borran también los gastos que generó: la comisión
              {aBorrar && aBorrar.devoluciones > 0 ? " y las devoluciones" : ""}. Las
              ventas de /diario no se tocan.
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
    </>
  );
}
