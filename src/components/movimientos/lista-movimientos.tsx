"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { MenuAcciones } from "@/components/movimientos/menu-acciones";
import { usePanelMovimiento } from "@/components/movimientos/proveedor-movimientos";
import { useAmbito, useTiendas } from "@/components/tiendas/proveedor-tiendas";
import { cn } from "@/lib/utils";
import {
  colorTienda,
  conTienda as conTiendaEnHref,
  nombreTienda,
  type Tienda,
} from "@/lib/ambito";
import { ETIQUETA_MEDIO, ETIQUETA_MEDIO_CORTA } from "@/lib/medios-pago";
import { formatearEuros, formatearFecha, formatearNumero } from "@/lib/formato";
import {
  escribirFiltros,
  type CampoOrden,
  type Filtros,
} from "@/lib/esquemas/filtros";
import type { MovimientoConRelaciones } from "@/lib/tipos-db";

/** Importe con su signo y su color según sea ingreso o gasto. */
function ImporteConSigno({
  movimiento,
  className,
}: {
  movimiento: MovimientoConRelaciones;
  className?: string;
}) {
  const esIngreso = movimiento.tipo === "ingreso";
  const importeEur = Number(movimiento.total_eur);
  const signo = esIngreso ? "+" : "−";

  return (
    <span
      className={cn(
        "cifra font-medium tabular-nums",
        esIngreso ? "text-success" : "text-danger",
        className,
      )}
    >
      {signo}
      {formatearEuros(Math.abs(importeEur))}
    </span>
  );
}

/** Cabecera de columna ordenable, como enlace para que funcione sin JS. */
function CabeceraOrdenable({
  campo,
  etiqueta,
  filtros,
  className,
}: {
  campo: CampoOrden;
  etiqueta: string;
  filtros: Filtros;
  className?: string;
}) {
  const pathname = usePathname();
  const activo = filtros.orden === campo;
  const siguienteDireccion =
    activo && filtros.direccion === "desc" ? "asc" : "desc";

  const ambito = useAmbito();
  const query = escribirFiltros({
    ...filtros,
    orden: campo,
    direccion: siguienteDireccion,
    pagina: 1,
  });

  const Icono = !activo ? ArrowUpDown : filtros.direccion === "asc" ? ArrowUp : ArrowDown;

  return (
    <Link
      href={conTiendaEnHref(query ? `${pathname}?${query}` : pathname, ambito.slug)}
      scroll={false}
      aria-sort={activo ? (filtros.direccion === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-xs font-semibold tracking-wide uppercase transition-colors",
        activo ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
        className,
      )}
    >
      {etiqueta}
      <Icono aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

function BadgeCategoria({ nombre }: { nombre: string }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
      {nombre}
    </span>
  );
}

/**
 * Punto de color con la inicial del socio.
 *
 * `papel` acaba en el title y en el texto para lectores de pantalla porque las
 * dos columnas se ven idénticas y significan cosas distintas: una es quién
 * puso el dinero y la otra quién registró la fila.
 */
function PuntoSocio({
  nombre,
  color,
  papel,
}: {
  nombre: string | null;
  color: string | null;
  papel: string;
}) {
  if (!nombre) return <span className="text-text-muted">—</span>;

  return (
    <span className="inline-flex items-center gap-1.5" title={`${papel}: ${nombre}`}>
      <span
        aria-hidden="true"
        style={{ backgroundColor: color ?? "#6E6E73" }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="text-text-secondary">{nombre.slice(0, 1).toUpperCase()}</span>
      <span className="sr-only">{papel}: {nombre}</span>
    </span>
  );
}

/**
 * Con qué se pagó un gasto (0018): el medio y, si es un anticipo (tarjeta o
 * bolsillo), el socio al que se le debe.
 */
function PagadoPor({ movimiento }: { movimiento: MovimientoConRelaciones }) {
  const medio = movimiento.medio_pago;
  if (movimiento.tipo !== "gasto" || !medio) {
    return <span className="text-text-muted">—</span>;
  }

  if (medio === "banco" || medio === "paypal") {
    return (
      <span
        className="text-xs text-text-secondary"
        title={`Pagado por el negocio desde ${ETIQUETA_MEDIO[medio]}`}
      >
        {ETIQUETA_MEDIO_CORTA[medio]}
        <span className="sr-only"> (pagado por el negocio)</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={ETIQUETA_MEDIO[medio]}>
      <span className="text-xs text-text-secondary">{ETIQUETA_MEDIO_CORTA[medio]}</span>
      <PuntoSocio
        nombre={movimiento.anticipado?.nombre ?? null}
        color={movimiento.anticipado?.color ?? null}
        papel="Anticipado por"
      />
    </span>
  );
}

/** Tienda de la fila, en la vista «Todas». null = General / Sociedad. */
function EtiquetaTienda({
  tiendaId,
  tiendas,
}: {
  tiendaId: string | null;
  tiendas: Tienda[];
}) {
  const nombre = nombreTienda(tiendaId, tiendas);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5" title={nombre}>
      <span
        aria-hidden="true"
        style={{ backgroundColor: colorTienda(tiendaId, tiendas) }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="truncate text-xs text-text-secondary">{nombre}</span>
    </span>
  );
}

function EstadoReembolso({ movimiento }: { movimiento: MovimientoConRelaciones }) {
  if (movimiento.tipo !== "gasto") {
    return <span className="text-text-muted">—</span>;
  }

  return movimiento.reembolsado ? (
    <span className="inline-flex items-center rounded-md bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
      Reembolsado
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning">
      Pendiente
    </span>
  );
}

/**
 * Tabla en escritorio y tarjetas en móvil, sobre la misma lista.
 *
 * Guarda una copia local de las filas para poder aplicar los cambios
 * optimistas del menú de acciones; se resincroniza cuando el servidor manda
 * datos nuevos tras el revalidatePath.
 */
export function ListaMovimientos({
  filas,
  filtros,
}: {
  filas: MovimientoConRelaciones[];
  filtros: Filtros;
}) {
  const { abrirEdicion } = usePanelMovimiento();
  const tiendas = useTiendas();
  // En «Todas» se mezclan tiendas: cada fila dice de cuál es.
  const conTienda = useAmbito().tipo === "todas";
  const [locales, setLocales] = useState(filas);
  const [eliminados, setEliminados] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocales(filas);
    setEliminados(new Set());
  }, [filas]);

  function aplicarOptimista(
    id: string,
    cambio: { reembolsado?: boolean; eliminado?: boolean },
  ) {
    if (typeof cambio.eliminado === "boolean") {
      setEliminados((anterior) => {
        const siguiente = new Set(anterior);
        if (cambio.eliminado) siguiente.add(id);
        else siguiente.delete(id);
        return siguiente;
      });
      return;
    }

    if (typeof cambio.reembolsado === "boolean") {
      setLocales((anterior) =>
        anterior.map((fila) =>
          fila.id === id ? { ...fila, reembolsado: cambio.reembolsado! } : fila,
        ),
      );
    }
  }

  const visibles = useMemo(
    () => locales.filter((fila) => !eliminados.has(fila.id)),
    [locales, eliminados],
  );

  return (
    <>
      {/* ESCRITORIO */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <caption className="sr-only">
              Movimientos filtrados, ordenados por {filtros.orden}
            </caption>
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                <th scope="col" className="px-4 py-3">
                  <CabeceraOrdenable campo="fecha" etiqueta="Fecha" filtros={filtros} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <CabeceraOrdenable
                    campo="concepto"
                    etiqueta="Concepto"
                    filtros={filtros}
                  />
                </th>
                {conTienda ? (
                  <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
                    Tienda
                  </th>
                ) : null}
                <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
                  Categoría
                </th>
                <th
                  scope="col"
                  title="Medio de pago y, si es un anticipo, quién puso el dinero"
                  className="px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase"
                >
                  Pagado con
                </th>
                <th
                  scope="col"
                  title="Quién registró el movimiento. Solo esa persona puede editarlo o eliminarlo."
                  className="px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase"
                >
                  Registrado
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-text-muted uppercase">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <CabeceraOrdenable
                    campo="total_eur"
                    etiqueta="Total EUR"
                    filtros={filtros}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
                  Estado
                </th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {visibles.map((movimiento) => (
                <tr
                  key={movimiento.id}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-surface"
                >
                  <td className="cifra px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatearFecha(movimiento.fecha)}
                  </td>

                  <td className="max-w-[280px] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(movimiento)}
                      className="block max-w-full truncate text-left font-medium text-text-primary transition-colors hover:text-brand"
                    >
                      {movimiento.concepto}
                    </button>
                    {movimiento.notas ? (
                      <span className="block max-w-full truncate text-xs text-text-muted">
                        {movimiento.notas}
                      </span>
                    ) : null}
                  </td>

                  {conTienda ? (
                    <td className="max-w-[160px] px-4 py-3">
                      <EtiquetaTienda tiendaId={movimiento.tienda_id} tiendas={tiendas} />
                    </td>
                  ) : null}

                  <td className="px-4 py-3">
                    {movimiento.categorias ? (
                      <BadgeCategoria nombre={movimiento.categorias.nombre} />
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <PagadoPor movimiento={movimiento} />
                  </td>

                  <td className="px-4 py-3">
                    <PuntoSocio
                      nombre={movimiento.autor?.nombre ?? null}
                      color={movimiento.autor?.color ?? null}
                      papel="Registrado por"
                    />
                  </td>

                  <td className="cifra px-4 py-3 text-right whitespace-nowrap text-text-secondary">
                    {movimiento.divisa === "USD" ? (
                      <>
                        {formatearNumero(Number(movimiento.total))} $
                        <span className="block text-xs text-text-muted">
                          1 USD = {Number(movimiento.tasa_cambio)} €
                        </span>
                      </>
                    ) : (
                      formatearEuros(Number(movimiento.total))
                    )}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <ImporteConSigno movimiento={movimiento} />
                  </td>

                  <td className="px-4 py-3">
                    <EstadoReembolso movimiento={movimiento} />
                  </td>

                  <td className="px-2 py-3">
                    <MenuAcciones
                      movimiento={movimiento}
                      alCambiarOptimista={aplicarOptimista}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MÓVIL */}
      <ul className="flex flex-col gap-3 md:hidden">
        {visibles.map((movimiento) => (
          <li
            key={movimiento.id}
            className="rounded-xl border border-border bg-surface p-3"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => abrirEdicion(movimiento)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-semibold text-text-primary">
                  {movimiento.concepto}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                  {movimiento.categorias?.nombre ?? "Sin categoría"} ·{" "}
                  <span className="cifra">{formatearFecha(movimiento.fecha)}</span>
                </p>
                {conTienda ? (
                  <span className="mt-1 flex">
                    <EtiquetaTienda tiendaId={movimiento.tienda_id} tiendas={tiendas} />
                  </span>
                ) : null}
              </button>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <ImporteConSigno movimiento={movimiento} className="text-base" />
                {movimiento.divisa === "USD" ? (
                  <span className="cifra text-xs text-text-muted">
                    {formatearNumero(Number(movimiento.total))} $
                  </span>
                ) : null}
              </div>

              <MenuAcciones
                movimiento={movimiento}
                alCambiarOptimista={aplicarOptimista}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
              {movimiento.tipo === "gasto" ? (
                <EstadoReembolso movimiento={movimiento} />
              ) : null}

              <span className="ml-auto flex items-center gap-3">
                {movimiento.tipo === "gasto" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-text-muted">Con</span>
                    <PagadoPor movimiento={movimiento} />
                  </span>
                ) : null}

                <span className="flex items-center gap-1.5">
                  <span className="text-text-muted">Registró</span>
                  <PuntoSocio
                    nombre={movimiento.autor?.nombre ?? null}
                    color={movimiento.autor?.color ?? null}
                    papel="Registrado por"
                  />
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
