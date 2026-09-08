"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FormularioCuenta } from "@/components/cuentas/formulario-cuenta";
import type { CuentaConCoste } from "@/lib/tipos-cuentas";
import type { Categoria, Perfil } from "@/lib/tipos-db";

type Contexto = {
  abrirNueva: () => void;
  abrirEdicion: (cuenta: CuentaConCoste) => void;
  abrirDuplicado: (cuenta: CuentaConCoste) => void;
};

const Ctx = createContext<Contexto | null>(null);

export function usePanelCuenta(): Contexto {
  const contexto = useContext(Ctx);
  if (!contexto) {
    throw new Error("usePanelCuenta debe usarse dentro de <ProveedorCuentas>");
  }
  return contexto;
}

/** Mantiene el panel del formulario en la página, igual que en movimientos. */
export function ProveedorCuentas({
  socios,
  categorias,
  tiposUsados,
  usuarioId,
  tasaUsd,
  children,
}: {
  socios: Perfil[];
  categorias: Categoria[];
  tiposUsados: string[];
  usuarioId: string;
  tasaUsd: number | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cuenta, setCuenta] = useState<CuentaConCoste | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [clave, setClave] = useState(0);

  const abrir = useCallback((fila: CuentaConCoste | null, duplicar = false) => {
    setCuenta(fila);
    setDuplicando(duplicar);
    setSucio(false);
    setClave((v) => v + 1);
    setAbierto(true);
  }, []);

  const valor = useMemo<Contexto>(
    () => ({
      abrirNueva: () => abrir(null),
      abrirEdicion: (fila) => abrir(fila),
      // Duplicar: mismos datos pero sin id, así se guarda como cuenta nueva.
      abrirDuplicado: (fila) =>
        abrir({ ...fila, id: null, nombre: `${fila.nombre} (copia)` } as CuentaConCoste, true),
    }),
    [abrir],
  );

  function intentarCerrar(siguiente: boolean) {
    if (siguiente) {
      setAbierto(true);
      return;
    }
    if (sucio) {
      setConfirmar(true);
      return;
    }
    setAbierto(false);
  }

  const editando = cuenta !== null && !duplicando;

  return (
    <Ctx.Provider value={valor}>
      {children}

      <Sheet open={abierto} onOpenChange={intentarCerrar}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-border bg-base p-0 sm:max-w-[480px]"
          onEscapeKeyDown={(evento) => {
            if (sucio) {
              evento.preventDefault();
              setConfirmar(true);
            }
          }}
          onInteractOutside={(evento) => {
            if (sucio) evento.preventDefault();
          }}
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle className="text-base font-semibold text-text-primary">
              {editando ? "Editar cuenta" : duplicando ? "Duplicar cuenta" : "Nueva cuenta"}
            </SheetTitle>
            <SheetDescription className="text-sm text-text-secondary">
              Inventario de qué existe, de quién es y qué cuesta. Sin contraseñas.
            </SheetDescription>
          </SheetHeader>

          <FormularioCuenta
            key={clave}
            cuenta={editando ? cuenta : duplicando ? cuenta : null}
            socios={socios}
            categorias={categorias}
            tiposUsados={tiposUsados}
            usuarioId={usuarioId}
            tasaUsd={tasaUsd}
            alCambiarSuciedad={setSucio}
            alTerminar={() => {
              setSucio(false);
              setAbierto(false);
              router.refresh();
            }}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Descartar los cambios?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Has escrito datos que todavía no se han guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSucio(false);
                setConfirmar(false);
                setAbierto(false);
              }}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

export function BotonNuevaCuenta() {
  const { abrirNueva } = usePanelCuenta();
  return (
    <button
      type="button"
      onClick={abrirNueva}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
    >
      Nueva cuenta
    </button>
  );
}
