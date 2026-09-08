"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  crearCategoria,
  eliminarCategoria,
  renombrarCategoria,
  reordenarCategorias,
} from "@/app/acciones/categorias";
import { cn } from "@/lib/utils";
import { formatearEntero, formatearEuros } from "@/lib/formato";
import type { CategoriaConUso, TipoMovimiento } from "@/lib/tipos-db";

/**
 * Gestión de categorías de un tipo (gasto o ingreso).
 *
 * Se puede reordenar arrastrando y TAMBIÉN con dos botones de subir/bajar: el
 * arrastre solo no es accesible con teclado ni cómodo en móvil, así que las dos
 * vías conviven y escriben el mismo campo `orden`.
 */
export function GestorCategorias({
  tipo,
  titulo,
  categorias,
}: {
  tipo: TipoMovimiento;
  titulo: string;
  categorias: CategoriaConUso[];
}) {
  const [lista, setLista] = useState(categorias);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [aBorrar, setABorrar] = useState<CategoriaConUso | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  useEffect(() => setLista(categorias), [categorias]);

  function guardarOrden(nuevaLista: CategoriaConUso[]) {
    setLista(nuevaLista);
    iniciarTransicion(async () => {
      const resultado = await reordenarCategorias(nuevaLista.map((c) => c.id));
      if (!resultado.ok) {
        setLista(categorias);
        toast.error(resultado.error);
      }
    });
  }

  function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= lista.length) return;
    const copia = [...lista];
    const [movida] = copia.splice(indice, 1);
    copia.splice(destino, 0, movida!);
    guardarOrden(copia);
  }

  function soltarSobre(idDestino: string) {
    if (!arrastrando || arrastrando === idDestino) return;
    const origen = lista.findIndex((c) => c.id === arrastrando);
    const destino = lista.findIndex((c) => c.id === idDestino);
    if (origen < 0 || destino < 0) return;

    const copia = [...lista];
    const [movida] = copia.splice(origen, 1);
    copia.splice(destino, 0, movida!);
    setArrastrando(null);
    guardarOrden(copia);
  }

  function renombrar(id: string) {
    const limpio = nombreEditado.trim();
    if (!limpio) {
      setEditando(null);
      return;
    }
    iniciarTransicion(async () => {
      const resultado = await renombrarCategoria(id, limpio);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setLista((anterior) =>
        anterior.map((c) => (c.id === id ? { ...c, nombre: limpio } : c)),
      );
      setEditando(null);
      toast.success("Categoría renombrada.");
    });
  }

  function crear() {
    const limpio = nombreNuevo.trim();
    if (!limpio) return;
    iniciarTransicion(async () => {
      const resultado = await crearCategoria({ nombre: limpio, tipo });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setNombreNuevo("");
      setCreando(false);
      toast.success("Categoría creada.");
    });
  }

  function borrar(categoria: CategoriaConUso) {
    setABorrar(null);
    iniciarTransicion(async () => {
      const resultado = await eliminarCategoria(categoria.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setLista((anterior) => anterior.filter((c) => c.id !== categoria.id));
      toast.success("Categoría eliminada.");
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">
          {titulo}
          <span className="ml-2 text-sm font-normal text-text-muted">
            {lista.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setCreando((valor) => !valor)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2"
        >
          <Plus aria-hidden="true" className="size-4" />
          Nueva
        </button>
      </div>

      {creando ? (
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-3">
          <label htmlFor={`nueva-${tipo}`} className="sr-only">
            Nombre de la nueva categoría
          </label>
          <input
            id={`nueva-${tipo}`}
            autoFocus
            value={nombreNuevo}
            onChange={(evento) => setNombreNuevo(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                crear();
              }
              if (evento.key === "Escape") setCreando(false);
            }}
            placeholder="Nombre de la categoría"
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
          />
          <button
            type="button"
            onClick={crear}
            disabled={pendiente}
            className="min-h-11 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            aria-label="Cancelar"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}

      <ul
        className={cn(
          "overflow-hidden rounded-xl border border-border",
          pendiente && "opacity-70",
        )}
      >
        {lista.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-text-secondary">
            Todavía no hay categorías de este tipo.
          </li>
        ) : null}

        {lista.map((categoria, indice) => {
          const sePuedeBorrar =
            !categoria.es_sistema && categoria.num_movimientos === 0;
          const motivoBloqueo = categoria.es_sistema
            ? "Las categorías de sistema no se pueden eliminar."
            : `Tiene ${categoria.num_movimientos} movimiento${categoria.num_movimientos === 1 ? "" : "s"} asociado${categoria.num_movimientos === 1 ? "" : "s"}.`;

          return (
            <li
              key={categoria.id}
              draggable
              onDragStart={() => setArrastrando(categoria.id)}
              onDragEnd={() => setArrastrando(null)}
              onDragOver={(evento) => evento.preventDefault()}
              onDrop={() => soltarSobre(categoria.id)}
              className={cn(
                "flex items-center gap-2 border-b border-border bg-surface px-2 py-2 last:border-b-0 sm:px-3",
                arrastrando === categoria.id && "opacity-40",
              )}
            >
              <span
                aria-hidden="true"
                className="hidden cursor-grab text-text-muted sm:block"
                title="Arrastra para reordenar"
              >
                <GripVertical className="size-4" />
              </span>

              {/* Reordenar también con teclado y en móvil. */}
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => mover(indice, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir ${categoria.nombre}`}
                  className="flex size-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronUp aria-hidden="true" className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(indice, 1)}
                  disabled={indice === lista.length - 1}
                  aria-label={`Bajar ${categoria.nombre}`}
                  className="flex size-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editando === categoria.id ? (
                  <input
                    autoFocus
                    value={nombreEditado}
                    onChange={(evento) => setNombreEditado(evento.target.value)}
                    onBlur={() => renombrar(categoria.id)}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter") {
                        evento.preventDefault();
                        renombrar(categoria.id);
                      }
                      if (evento.key === "Escape") setEditando(null);
                    }}
                    aria-label={`Nuevo nombre para ${categoria.nombre}`}
                    className="h-9 w-full rounded-lg border border-brand bg-surface-2 px-2 text-sm text-text-primary outline-none"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {categoria.nombre}
                    </span>
                    {categoria.es_sistema ? (
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
                        Sistema
                      </span>
                    ) : null}
                  </div>
                )}

                <p className="cifra mt-0.5 text-xs text-text-secondary">
                  {formatearEntero(categoria.num_movimientos)} movimiento
                  {categoria.num_movimientos === 1 ? "" : "s"}
                  {categoria.num_movimientos > 0
                    ? ` · ${formatearEuros(categoria.total_eur)}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditando(categoria.id);
                  setNombreEditado(categoria.nombre);
                }}
                aria-label={`Renombrar ${categoria.nombre}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </button>

              {sePuedeBorrar ? (
                <button
                  type="button"
                  onClick={() => setABorrar(categoria)}
                  aria-label={`Eliminar ${categoria.nombre}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      role="button"
                      aria-disabled="true"
                      aria-label={`No se puede eliminar ${categoria.nombre}. ${motivoBloqueo}`}
                      className="flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-lg text-text-muted opacity-40"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">{motivoBloqueo}</TooltipContent>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={aBorrar !== null}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar «{aBorrar?.nombre}»?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              No tiene movimientos asociados, así que se puede borrar sin
              afectar a ningún registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aBorrar && borrar(aBorrar)}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendiente ? (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
          Guardando…
        </p>
      ) : null}
    </section>
  );
}
