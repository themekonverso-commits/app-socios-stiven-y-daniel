"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { SelectorFecha } from "@/components/campos/selector-fecha";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatearFecha } from "@/lib/formato";
import {
  PRESETS_FECHA,
  escribirFiltros,
  hayFiltrosActivos,
  rangoDePreset,
  type Filtros,
  type PresetFecha,
} from "@/lib/esquemas/filtros";
import type { Categoria, Perfil } from "@/lib/tipos-db";

const CLASE_CONTROL =
  "flex h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary transition-colors outline-none hover:bg-surface focus-visible:border-brand";

/**
 * Barra de filtros de /movimientos.
 *
 * Todo el estado vive en la query string: así una vista filtrada se puede
 * guardar en marcadores, compartir, y el botón «atrás» del navegador funciona.
 * Cada cambio vuelve a la página 1, porque si no se puede acabar en una página
 * que ya no existe.
 */
export function BarraFiltros({
  filtros,
  categorias,
  socios,
}: {
  filtros: Filtros;
  categorias: Categoria[];
  socios: Perfil[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();

  const [busqueda, setBusqueda] = useState(filtros.q);
  const primeraCarga = useRef(true);

  const navegar = useCallback(
    (cambios: Partial<Filtros>) => {
      const siguientes: Filtros = { ...filtros, ...cambios, pagina: 1 };
      const query = escribirFiltros(siguientes);
      iniciarTransicion(() => {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [filtros, pathname, router],
  );

  // Buscador con debounce de 300 ms: no se navega en cada tecla.
  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    if (busqueda === filtros.q) return;

    const temporizador = window.setTimeout(() => {
      navegar({ q: busqueda });
    }, 300);

    return () => window.clearTimeout(temporizador);
    // `navegar` cambia de identidad en cada render nuevo de filtros; la guarda
    // de arriba corta el ciclo, así que incluirlo es seguro.
  }, [busqueda, filtros.q, navegar]);

  // Si los filtros se limpian desde fuera, el input debe seguirlos.
  useEffect(() => {
    setBusqueda(filtros.q);
  }, [filtros.q]);

  const categoriasSeleccionadas = useMemo(
    () => new Set(filtros.categorias),
    [filtros.categorias],
  );

  const etiquetaCategorias =
    filtros.categorias.length === 0
      ? "Todas las categorías"
      : filtros.categorias.length === 1
        ? (categorias.find((c) => c.id === filtros.categorias[0])?.nombre ??
          "1 categoría")
        : `${filtros.categorias.length} categorías`;

  const activos = hayFiltrosActivos(filtros);

  return (
    <div
      className={cn(
        // Pegada arriba al hacer scroll, para no perder los filtros de vista.
        "sticky top-0 z-20 -mx-4 border-b border-border bg-base/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8",
        pendiente && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Rango de fechas */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={CLASE_CONTROL}>
              <span className="cifra truncate">
                {PRESETS_FECHA.find((p) => p.valor === filtros.preset)?.etiqueta}
              </span>
              <span className="hidden text-text-muted sm:inline">
                {formatearFecha(filtros.desde)} – {formatearFecha(filtros.hasta)}
              </span>
              <ChevronDown aria-hidden="true" className="size-4 text-text-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 border-border bg-surface p-2">
            <div className="flex flex-col gap-1">
              {PRESETS_FECHA.map((preset) => (
                <button
                  key={preset.valor}
                  type="button"
                  onClick={() => {
                    if (preset.valor === "personalizado") {
                      navegar({ preset: "personalizado" });
                      return;
                    }
                    const rango = rangoDePreset(preset.valor as PresetFecha);
                    navegar({ preset: preset.valor as PresetFecha, ...rango });
                  }}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                    filtros.preset === preset.valor
                      ? "bg-surface-2 font-medium text-text-primary"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  )}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "size-4 text-brand",
                      filtros.preset === preset.valor ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {preset.etiqueta}
                </button>
              ))}
            </div>

            {filtros.preset === "personalizado" ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Desde</span>
                  <SelectorFecha
                    valor={filtros.desde}
                    conAccesosRapidos={false}
                    alCambiar={(valor) =>
                      navegar({ preset: "personalizado", desde: valor })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Hasta</span>
                  <SelectorFecha
                    valor={filtros.hasta}
                    conAccesosRapidos={false}
                    alCambiar={(valor) =>
                      navegar({ preset: "personalizado", hasta: valor })
                    }
                  />
                </div>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>

        {/* Tipo */}
        <div
          role="radiogroup"
          aria-label="Tipo de movimiento"
          className="flex h-11 items-center gap-1 rounded-lg border border-border bg-surface-2 p-1"
        >
          {(
            [
              { valor: "todos", etiqueta: "Todos" },
              { valor: "ingreso", etiqueta: "Ingresos" },
              { valor: "gasto", etiqueta: "Gastos" },
            ] as const
          ).map((opcion) => (
            <label
              key={opcion.valor}
              className={cn(
                "flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors",
                filtros.tipo === opcion.valor
                  ? "bg-brand text-white"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary",
              )}
            >
              <input
                type="radio"
                name="filtro-tipo"
                className="sr-only"
                checked={filtros.tipo === opcion.valor}
                onChange={() => navegar({ tipo: opcion.valor })}
              />
              {opcion.etiqueta}
            </label>
          ))}
        </div>

        {/* Categorías (multiselección) */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={CLASE_CONTROL}>
              <span className="truncate">{etiquetaCategorias}</span>
              <ChevronDown aria-hidden="true" className="size-4 text-text-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 border-border bg-surface p-2">
            <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {categorias.map((categoria) => {
                const marcada = categoriasSeleccionadas.has(categoria.id);
                return (
                  <label
                    key={categoria.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => {
                        const siguiente = marcada
                          ? filtros.categorias.filter((id) => id !== categoria.id)
                          : [...filtros.categorias, categoria.id];
                        navegar({ categorias: siguiente });
                      }}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="truncate">{categoria.nombre}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-text-muted">
                      {categoria.tipo === "gasto" ? "gasto" : "ingreso"}
                    </span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Anticipado por — quién puso el dinero */}
        <select
          aria-label="Anticipado por"
          value={filtros.anticipado}
          onChange={(evento) => navegar({ anticipado: evento.target.value })}
          className={cn(CLASE_CONTROL, "cursor-pointer pr-8")}
        >
          <option value="todos">Anticipó: cualquiera</option>
          {socios.map((socio) => (
            <option key={socio.id} value={socio.id}>
              Anticipó: {socio.nombre}
            </option>
          ))}
          <option value="sin-asignar">Sin asignar</option>
        </select>

        {/* Registrado por — quién dio de alta la fila. No es lo mismo. */}
        <select
          aria-label="Registrado por"
          value={filtros.registrado}
          onChange={(evento) => navegar({ registrado: evento.target.value })}
          className={cn(CLASE_CONTROL, "cursor-pointer pr-8")}
        >
          <option value="todos">Registró: todos</option>
          {socios.map((socio) => (
            <option key={socio.id} value={socio.id}>
              Registró: {socio.nombre}
            </option>
          ))}
        </select>

        {/* Estado de reembolso */}
        <select
          aria-label="Estado de reembolso"
          value={filtros.reembolso}
          onChange={(evento) =>
            navegar({ reembolso: evento.target.value as Filtros["reembolso"] })
          }
          className={cn(CLASE_CONTROL, "cursor-pointer pr-8")}
        >
          <option value="todos">Reembolso: todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="reembolsado">Reembolsado</option>
        </select>

        {/* Buscador */}
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="buscador-movimientos" className="sr-only">
            Buscar en concepto y notas
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            id="buscador-movimientos"
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar en concepto y notas…"
            className="h-11 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand"
          />
        </div>

        {activos ? (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              iniciarTransicion(() => router.push(pathname, { scroll: false }));
            }}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X aria-hidden="true" className="size-4" />
            Limpiar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
}
