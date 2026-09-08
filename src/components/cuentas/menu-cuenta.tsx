"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  CreditCard,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
  X,
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
import { usePanelCuenta } from "@/components/cuentas/proveedor-cuentas";
import {
  cambiarEstadoCuenta,
  eliminarCuenta,
  registrarPagoCuenta,
} from "@/app/acciones/cuentas";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { CuentaConCoste } from "@/lib/tipos-cuentas";

export function MenuCuenta({ cuenta }: { cuenta: CuentaConCoste }) {
  const router = useRouter();
  const { abrirEdicion, abrirDuplicado } = usePanelCuenta();
  const [confirmar, setConfirmar] = useState(false);
  const [, iniciarTransicion] = useTransition();

  const sinCategoria = !cuenta.categoria_gasto_id;

  function pagar() {
    iniciarTransicion(async () => {
      const resultado = await registrarPagoCuenta(String(cuenta.id));
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      const datos = resultado.datos;
      toast.success(
        datos?.renovacion_avanzada && datos.fecha_renovacion
          ? `Gasto de ${formatearEuros(datos.importe_eur)} registrado. La renovación pasa al ${formatearFecha(datos.fecha_renovacion)}.`
          : `Gasto de ${formatearEuros(datos?.importe_eur ?? 0)} registrado.`,
      );
      router.refresh();
    });
  }

  function cambiarEstado(estado: string) {
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoCuenta(String(cuenta.id), estado);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success(`Cuenta marcada como ${estado}.`);
      router.refresh();
    });
  }

  function borrar() {
    setConfirmar(false);
    iniciarTransicion(async () => {
      const resultado = await eliminarCuenta(String(cuenta.id));
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Cuenta eliminada del inventario.");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Acciones de ${cuenta.nombre}`}
            className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60 border-border bg-surface">
          <DropdownMenuItem onSelect={() => abrirEdicion(cuenta)}>
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(evento) => {
              if (sinCategoria) {
                evento.preventDefault();
                toast.warning(
                  "Asigna primero una categoría de gasto: si no, no se sabe dónde imputar el pago.",
                );
                return;
              }
              pagar();
            }}
          >
            <CreditCard aria-hidden="true" className="size-4" />
            Registrar pago
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => abrirDuplicado(cuenta)}>
            <Copy aria-hidden="true" className="size-4" />
            Duplicar
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-border" />

          {cuenta.estado !== "activa" ? (
            <DropdownMenuItem onSelect={() => cambiarEstado("activa")}>
              <Play aria-hidden="true" className="size-4" />
              Marcar como activa
            </DropdownMenuItem>
          ) : null}
          {cuenta.estado !== "pausada" ? (
            <DropdownMenuItem onSelect={() => cambiarEstado("pausada")}>
              <Pause aria-hidden="true" className="size-4" />
              Pausar
            </DropdownMenuItem>
          ) : null}
          {cuenta.estado !== "cancelada" ? (
            <DropdownMenuItem onSelect={() => cambiarEstado("cancelada")}>
              <X aria-hidden="true" className="size-4" />
              Cancelar
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator className="bg-border" />

          <DropdownMenuItem
            onSelect={(evento) => {
              evento.preventDefault();
              setConfirmar(true);
            }}
            className="text-danger focus:text-danger"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar «{cuenta.nombre}» del inventario?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Los gastos ya registrados de esta cuenta se conservan en
              Movimientos. Lo que se borra es la ficha del inventario.
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
