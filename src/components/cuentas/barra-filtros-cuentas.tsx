"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, LayoutGrid, List, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { mayusculaInicial } from "@/lib/formato";
import {
  escribirFiltrosCuentas,
  hayFiltrosCuentasActivos,
  type FiltrosCuentas,
} from "@/lib/esquemas/cuentas";
import { ESTADOS_CUENTA, PERIODICIDADES } from "@/lib/tipos-cuentas";
import type { Perfil } from "@/lib/tipos-db";

const CLASE =
  "flex h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary transition-colors outline-none hover:bg-surface focus-visible:border-brand";

export function BarraFiltrosCuentas({
  filtros,
  socios,
  tipos,
}: {
  filtros: FiltrosCuentas;
  socios: Perfil[];
  tipos: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();
  const [busqueda, setBusqueda] = useState(filtros.q);
  const primera = useRef(true);

  const navegar = useCallback(
    (cambios: Partial<FiltrosCuentas>) => {
      const query = escribirFiltrosCuentas({ ...filtros, ...cambios });
      iniciarTransicion(() => {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [filtros, pathname, router],
  );

  // Debounce de 300 ms: no se navega en cada tecla.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (busqueda === filtros.q) return;
    const t = window.setTimeout(() => navegar({ q: busqueda }), 300);
    return () => window.clearTimeout(t);
  }, [busqueda, filtros.q, navegar]);

  useEffect(() => setBusqueda(filtros.q), [filtros.q]);

  /** La preferencia de vista va en cookie, no en localStorage. */
  function cambiarVista(vista: "tarjetas" | "tabla") {
    document.cookie = `vista_cuentas=${vista}; path=/; max-age=31536000; samesite=lax`;
    navegar({ vista });
  }

  const activos = hayFiltrosCuentasActivos(filtros);
  const query = escribirFiltrosCuentas(filtros);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Tipo de cuenta"
        value={filtros.tipo}
        onChange={(e) => navegar({ tipo: e.target.value })}
        className={cn(CLASE, "cursor-pointer")}
      >
        <option value="todos">Todos los tipos</option>
        {tipos.map((t) => (
          <option key={t} value={t}>{mayusculaInicial(t)}</option>
        ))}
      </select>

      <select
        aria-label="Estado"
        value={filtros.estado}
        onChange={(e) => navegar({ estado: e.target.value })}
        className={cn(CLASE, "cursor-pointer")}
      >
        <option value="todos">Todos los estados</option>
        {ESTADOS_CUENTA.map((e) => (
          <option key={e} value={e}>{mayusculaInicial(e)}</option>
        ))}
      </select>

      <select
        aria-label="Titular"
        value={filtros.titular}
        onChange={(e) => navegar({ titular: e.target.value })}
        className={cn(CLASE, "cursor-pointer")}
      >
        <option value="todos">Cualquier titular</option>
        {socios.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
        <option value="sin-asignar">Sin titular</option>
      </select>

      <select
        aria-label="Periodicidad"
        value={filtros.periodicidad}
        onChange={(e) => navegar({ periodicidad: e.target.value })}
        className={cn(CLASE, "cursor-pointer")}
      >
        <option value="todos">Cualquier periodicidad</option>
        {PERIODICIDADES.map((p) => (
          <option key={p} value={p}>{mayusculaInicial(p)}</option>
        ))}
      </select>

      <div className="relative min-w-[200px] flex-1">
        <label htmlFor="buscador-cuentas" className="sr-only">
          Buscar en nombre y notas
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        />
        <input
          id="buscador-cuentas"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en nombre y notas…"
          className="h-11 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
        />
      </div>

      {activos ? (
        <button
          type="button"
          onClick={() => {
            setBusqueda("");
            iniciarTransicion(() =>
              router.push(`${pathname}?vista=${filtros.vista}`, { scroll: false }),
            );
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <X aria-hidden="true" className="size-4" />
          Limpiar
        </button>
      ) : null}

      <a
        href={`/api/cuentas/exportar${query ? `?${query}` : ""}`}
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
      >
        <Download aria-hidden="true" className="size-4" />
        CSV
      </a>

      {/* Conmutador de vista */}
      <div
        role="radiogroup"
        aria-label="Forma de ver el listado"
        className={cn("flex h-11 items-center gap-1 rounded-lg border border-border bg-surface-2 p-1", pendiente && "opacity-70")}
      >
        {(
          [
            { valor: "tarjetas" as const, etiqueta: "Tarjetas", Icono: LayoutGrid },
            { valor: "tabla" as const, etiqueta: "Tabla", Icono: List },
          ]
        ).map(({ valor, etiqueta, Icono }) => (
          <label
            key={valor}
            title={etiqueta}
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors",
              filtros.vista === valor
                ? "bg-brand text-white"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
            )}
          >
            <input
              type="radio"
              name="vista-cuentas"
              className="sr-only"
              checked={filtros.vista === valor}
              onChange={() => cambiarVista(valor)}
            />
            <Icono aria-hidden="true" className="size-4" />
            <span className="sr-only">{etiqueta}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
