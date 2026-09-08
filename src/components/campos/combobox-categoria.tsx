"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Categoria, TipoMovimiento } from "@/lib/tipos-db";

export type SeleccionCategoria =
  | { tipo: "existente"; id: string; nombre: string }
  | { tipo: "nueva"; nombre: string };

/**
 * Combobox de categorías con búsqueda y creación al vuelo.
 *
 * Si lo que se escribe no coincide con ninguna categoría del tipo actual,
 * aparece «Crear categoría». La categoría no se crea aquí: se marca como
 * pendiente y la crea el Server Action al guardar el movimiento, de modo que
 * abrir el formulario y arrepentirse no deja categorías huérfanas.
 */
export function ComboboxCategoria({
  id,
  categorias,
  tipo,
  seleccion,
  alCambiar,
  invalido,
}: {
  id?: string;
  categorias: Categoria[];
  tipo: TipoMovimiento;
  seleccion: SeleccionCategoria | null;
  alCambiar: (seleccion: SeleccionCategoria | null) => void;
  invalido?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // El rol combobox obliga a declarar qué elemento despliega.
  const idPanel = useId();

  // Solo las del tipo elegido, las de sistema primero por su campo `orden`.
  const disponibles = useMemo(
    () =>
      categorias
        .filter((categoria) => categoria.tipo === tipo)
        .sort((a, b) => {
          if (a.es_sistema !== b.es_sistema) return a.es_sistema ? -1 : 1;
          const ordenA = a.orden ?? 100;
          const ordenB = b.orden ?? 100;
          if (ordenA !== ordenB) return ordenA - ordenB;
          return a.nombre.localeCompare(b.nombre, "es");
        }),
    [categorias, tipo],
  );

  const termino = busqueda.trim();
  const coincidenciaExacta = disponibles.some(
    (categoria) => categoria.nombre.toLowerCase() === termino.toLowerCase(),
  );
  const puedeCrear = termino.length > 0 && !coincidenciaExacta;

  const etiqueta = seleccion
    ? seleccion.tipo === "nueva"
      ? `${seleccion.nombre} (nueva)`
      : seleccion.nombre
    : "Elige una categoría";

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idPanel}
          aria-invalid={invalido || undefined}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-left text-base transition-colors outline-none hover:bg-surface focus-visible:border-brand aria-invalid:border-danger",
            seleccion ? "text-text-primary" : "text-text-muted",
          )}
        >
          <span className="truncate">{etiqueta}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-text-muted"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        id={idPanel}
        align="start"
        className="w-(--radix-popover-trigger-width) border-border bg-surface p-0"
      >
        <Command
          // El filtrado lo hacemos nosotros para poder ofrecer «crear».
          shouldFilter={false}
          className="bg-surface"
        >
          <CommandInput
            placeholder="Buscar o escribir una nueva…"
            value={busqueda}
            onValueChange={setBusqueda}
          />

          <CommandList>
            {!puedeCrear && disponibles.length === 0 ? (
              <CommandEmpty>No hay categorías de este tipo.</CommandEmpty>
            ) : null}

            {puedeCrear ? (
              <CommandGroup heading="Crear">
                <CommandItem
                  value={`crear-${termino}`}
                  onSelect={() => {
                    alCambiar({ tipo: "nueva", nombre: termino });
                    setBusqueda("");
                    setAbierto(false);
                  }}
                  className="gap-2"
                >
                  <Plus aria-hidden="true" className="size-4 text-brand" />
                  <span className="truncate">
                    Crear categoría: «{termino}»
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}

            <CommandGroup heading={tipo === "gasto" ? "Gastos" : "Ingresos"}>
              {disponibles
                .filter((categoria) =>
                  termino
                    ? categoria.nombre
                        .toLowerCase()
                        .includes(termino.toLowerCase())
                    : true,
                )
                .map((categoria) => {
                  const activa =
                    seleccion?.tipo === "existente" &&
                    seleccion.id === categoria.id;

                  return (
                    <CommandItem
                      key={categoria.id}
                      value={categoria.id}
                      onSelect={() => {
                        alCambiar({
                          tipo: "existente",
                          id: categoria.id,
                          nombre: categoria.nombre,
                        });
                        setBusqueda("");
                        setAbierto(false);
                      }}
                      className="gap-2"
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          activa ? "opacity-100 text-brand" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{categoria.nombre}</span>
                      {!categoria.es_sistema ? (
                        <span className="ml-auto shrink-0 text-[11px] text-text-muted">
                          propia
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
