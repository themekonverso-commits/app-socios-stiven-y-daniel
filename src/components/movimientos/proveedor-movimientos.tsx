"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Lock } from "lucide-react";

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
import {
  FormularioMovimiento,
  type ModoFormulario,
} from "@/components/movimientos/formulario-movimiento";
import type { Categoria, MovimientoConRelaciones, Perfil } from "@/lib/tipos-db";

type ContextoMovimientos = {
  abrirNuevo: () => void;
  abrirEdicion: (movimiento: MovimientoConRelaciones) => void;
  abrirDuplicado: (movimiento: MovimientoConRelaciones) => void;
  /**
   * Quién está conectado. Sirve para no ofrecer acciones que la base de datos
   * va a rechazar de todos modos: editar y borrar son solo del autor
   * (migraciones 0012 y 0013).
   */
  usuarioId: string;
};

const Contexto = createContext<ContextoMovimientos | null>(null);

/**
 * Acceso al panel de movimiento desde cualquier punto de la aplicación.
 * El prefijo `use` no es decorativo: lo exige la regla rules-of-hooks de React.
 */
export function usePanelMovimiento(): ContextoMovimientos {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error(
      "usePanelMovimiento debe usarse dentro de <ProveedorMovimientos>",
    );
  }
  return contexto;
}

/**
 * Mantiene el panel lateral del formulario en el layout de la aplicación, para
 * que el botón «+ Nuevo movimiento» funcione igual desde cualquier pantalla y
 * el formulario no se desmonte al navegar.
 */
export function ProveedorMovimientos({
  categorias,
  socios,
  conceptos,
  usuarioId,
  ultimaTasa,
  children,
}: {
  categorias: Categoria[];
  socios: Perfil[];
  conceptos: string[];
  usuarioId: string;
  ultimaTasa: { fecha: string; tasa: number } | null;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<ModoFormulario>("crear");
  const [movimiento, setMovimiento] = useState<MovimientoConRelaciones | null>(null);
  const [sucio, setSucio] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  // Fuerza a remontar el formulario en cada apertura: así el estado inicial se
  // recalcula y no arrastra los datos del movimiento anterior.
  const [clave, setClave] = useState(0);

  const abrir = useCallback(
    (nuevoModo: ModoFormulario, fila: MovimientoConRelaciones | null) => {
      setModo(nuevoModo);
      setMovimiento(fila);
      setSucio(false);
      setClave((valor) => valor + 1);
      setAbierto(true);
    },
    [],
  );

  const valor = useMemo<ContextoMovimientos>(
    () => ({
      abrirNuevo: () => abrir("crear", null),
      abrirEdicion: (fila) => abrir("editar", fila),
      abrirDuplicado: (fila) => abrir("duplicar", fila),
      usuarioId,
    }),
    [abrir, usuarioId],
  );

  /** Cerrar con cambios sin guardar pide confirmación. */
  function intentarCerrar(siguienteAbierto: boolean) {
    if (siguienteAbierto) {
      setAbierto(true);
      return;
    }
    if (sucio) {
      setConfirmarCierre(true);
      return;
    }
    setAbierto(false);
  }

  // Editar lo ajeno no se ofrece, pero el panel no se fía y lo comprueba.
  const ajeno =
    modo === "editar" &&
    movimiento !== null &&
    movimiento.created_by !== usuarioId;

  const titulo = ajeno
    ? "Movimiento de otro socio"
    : modo === "editar"
      ? "Editar movimiento"
      : modo === "duplicar"
        ? "Duplicar movimiento"
        : "Nuevo movimiento";

  return (
    <Contexto.Provider value={valor}>
      {children}

      <Sheet open={abierto} onOpenChange={intentarCerrar}>
        <SheetContent
          side="right"
          // En móvil ocupa toda la pantalla; en escritorio, un panel lateral.
          className="flex w-full flex-col gap-0 border-border bg-base p-0 sm:max-w-[480px]"
          onEscapeKeyDown={(evento) => {
            if (sucio) {
              evento.preventDefault();
              setConfirmarCierre(true);
            }
          }}
          onInteractOutside={(evento) => {
            if (sucio) evento.preventDefault();
          }}
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle className="text-base font-semibold text-text-primary">
              {titulo}
            </SheetTitle>
            <SheetDescription className="text-sm text-text-secondary">
              {ajeno
                ? "Puedes verlo y duplicarlo, pero no modificarlo."
                : modo === "duplicar"
                ? "Mismos datos con la fecha de hoy. Revísalo antes de guardar."
                : "Los importes se guardan en su divisa y convertidos a euros."}
            </SheetDescription>
          </SheetHeader>

          {ajeno && movimiento ? (
            /* Guardarraíl. El menú ya esconde «Editar» en los movimientos
               ajenos, así que llegar aquí significa que se ha entrado por otra
               vía. La base de datos lo rechazaría igual (migración 0012); esto
               es para que lo rechace con una frase y no con un error técnico. */
            <div className="flex flex-1 flex-col items-start gap-4 p-4 sm:p-6">
              <p className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary">
                <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  Este movimiento lo registró{" "}
                  <span className="font-medium text-text-primary">
                    {movimiento.autor?.nombre ?? "el otro socio"}
                  </span>
                  . Solo {movimiento.autor?.nombre ? "él" : "quien lo registró"}{" "}
                  puede modificarlo o eliminarlo.
                </span>
              </p>

              <p className="text-sm text-text-secondary">
                Sí puedes <span className="text-text-primary">duplicarlo</span>:
                se crea un movimiento nuevo a tu nombre y el suyo queda intacto.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => abrir("duplicar", movimiento)}
                  className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  Duplicar a mi nombre
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="min-h-11 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
          <FormularioMovimiento
            key={clave}
            modo={modo}
            movimiento={movimiento}
            categorias={categorias}
            socios={socios}
            conceptos={conceptos}
            usuarioId={usuarioId}
            ultimaTasa={ultimaTasa}
            alCambiarSuciedad={setSucio}
            alTerminar={() => {
              setSucio(false);
              setAbierto(false);
            }}
          />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Descartar los cambios?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Has escrito datos que todavía no se han guardado. Si cierras
              ahora, se pierden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Seguir editando
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSucio(false);
                setConfirmarCierre(false);
                setAbierto(false);
              }}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Contexto.Provider>
  );
}
