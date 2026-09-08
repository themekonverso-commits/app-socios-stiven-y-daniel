"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePanelMovimiento } from "@/components/movimientos/proveedor-movimientos";
import { eliminarMovimiento, marcarReembolsado } from "@/app/acciones/movimientos";
import { formatearEuros } from "@/lib/formato";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

/**
 * Acciones de una fila: editar, duplicar, marcar reembolso y eliminar.
 *
 * El reembolso y el borrado se pintan de inmediato (actualización optimista) y
 * se revierten si el servidor falla, con su toast de error. Sin eso, cada clic
 * se sentiría lento aunque el servidor tarde poco.
 */
export function MenuAcciones({
  movimiento,
  alCambiarOptimista,
}: {
  movimiento: MovimientoConRelaciones;
  alCambiarOptimista: (
    id: string,
    cambio: { reembolsado?: boolean; eliminado?: boolean },
  ) => void;
}) {
  const { abrirEdicion, abrirDuplicado } = usePanelMovimiento();
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [, iniciarTransicion] = useTransition();

  function alternarReembolso() {
    const siguiente = !movimiento.reembolsado;
    alCambiarOptimista(movimiento.id, { reembolsado: siguiente });

    iniciarTransicion(async () => {
      const resultado = await marcarReembolsado(movimiento.id, siguiente);
      if (!resultado.ok) {
        alCambiarOptimista(movimiento.id, { reembolsado: !siguiente });
        toast.error(resultado.error);
        return;
      }
      toast.success(
        siguiente ? "Marcado como reembolsado." : "Marcado como pendiente.",
      );
    });
  }

  function borrar() {
    setConfirmarBorrado(false);
    alCambiarOptimista(movimiento.id, { eliminado: true });

    iniciarTransicion(async () => {
      const resultado = await eliminarMovimiento(movimiento.id);
      if (!resultado.ok) {
        alCambiarOptimista(movimiento.id, { eliminado: false });
        toast.error(resultado.error);
        return;
      }
      toast.success("Movimiento eliminado.");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Acciones de ${movimiento.concepto}`}
            className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 border-border bg-surface">
          <DropdownMenuItem onSelect={() => abrirEdicion(movimiento)}>
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => abrirDuplicado(movimiento)}>
            <Copy aria-hidden="true" className="size-4" />
            Duplicar
          </DropdownMenuItem>

          {movimiento.tipo === "gasto" ? (
            <DropdownMenuItem onSelect={alternarReembolso}>
              {movimiento.reembolsado ? (
                <>
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Marcar como pendiente
                </>
              ) : (
                <>
                  <Check aria-hidden="true" className="size-4" />
                  Marcar como reembolsado
                </>
              )}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator className="bg-border" />

          <DropdownMenuItem
            onSelect={(evento) => {
              evento.preventDefault();
              setConfirmarBorrado(true);
            }}
            className="text-danger focus:text-danger"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar este movimiento?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-text-secondary">
                <p>Esta acción no se puede deshacer.</p>
                <p className="mt-3 rounded-lg border border-border bg-base p-3 text-text-primary">
                  <span className="font-medium">{movimiento.concepto}</span>
                  <br />
                  <span className="cifra">
                    {formatearEuros(Number(movimiento.total_eur))}
                  </span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={borrar}
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
