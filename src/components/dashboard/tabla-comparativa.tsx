"use client";

import { ChevronRight } from "lucide-react";

import { IconoAmbito } from "@/components/tiendas/selector-tienda";
import { useCambiarAmbito, useTiendas } from "@/components/tiendas/proveedor-tiendas";
import { COLOR_GENERAL, SLUG_GENERAL } from "@/lib/ambito";
import { formatearEuros, formatearNumero } from "@/lib/formato";
import { CLASE_NIVEL_ROAS, nivelRoas } from "@/lib/kpis";
import { cn } from "@/lib/utils";
import type { FilaComparativa } from "@/lib/consultas-kpi";

function textoRoas(roas: number | null): string {
  return roas === null ? "—" : `${formatearNumero(roas)}x`;
}

function textoMargen(margen: number | null): string {
  return margen === null ? "—" : `${formatearNumero(margen)} %`;
}

/**
 * Comparativa por tienda de la vista «Todas»: una fila por tienda y la de
 * General. Las cifras vienen tal cual de `fn_comparativa_tiendas`; aquí solo
 * se pintan. Pulsar una fila cambia a esa tienda conservando el periodo.
 *
 * En móvil la tabla no cabe: se convierte en tarjetas apiladas, sin scroll
 * horizontal de página.
 */
export function TablaComparativa({ filas }: { filas: FilaComparativa[] }) {
  const tiendas = useTiendas();
  const cambiarAmbito = useCambiarAmbito();

  const slugDe = (fila: FilaComparativa) =>
    fila.tiendaId === null
      ? SLUG_GENERAL
      : (tiendas.find((t) => t.id === fila.tiendaId)?.slug ?? null);

  const ir = (fila: FilaComparativa) => {
    const slug = slugDe(fila);
    if (slug) cambiarAmbito(slug);
  };

  const nombre = (fila: FilaComparativa) => (
    <span className="flex min-w-0 items-center gap-2">
      <IconoAmbito
        tipo={fila.tiendaId === null ? "general" : "tienda"}
        color={fila.color ?? COLOR_GENERAL}
      />
      <span className="truncate font-medium text-text-primary">{fila.nombre}</span>
      {fila.estado && fila.estado !== "activa" ? (
        <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-muted">
          {fila.estado === "pausada" ? "Pausada" : "Archivada"}
        </span>
      ) : null}
    </span>
  );

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
        Todavía no hay tiendas.
      </p>
    );
  }

  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {filas.map((fila) => {
          const esGeneral = fila.tiendaId === null;
          return (
            <li key={fila.tiendaId ?? "general"}>
              <button
                type="button"
                onClick={() => ir(fila)}
                aria-label={`Ver ${fila.nombre}`}
                className="flex w-full flex-col gap-2 rounded-lg border border-border bg-base p-3 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center justify-between gap-2">
                  {nombre(fila)}
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                </span>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {!esGeneral ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-text-secondary">Facturación</dt>
                      <dd className="cifra text-text-primary">{formatearEuros(fila.ingresos)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-secondary">Gastos</dt>
                    <dd className="cifra text-text-primary">{formatearEuros(fila.gastos)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-secondary">Beneficio</dt>
                    <dd
                      className={cn(
                        "cifra font-medium",
                        fila.beneficio >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {formatearEuros(fila.beneficio)}
                    </dd>
                  </div>
                  {!esGeneral ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-secondary">ROAS</dt>
                        <dd className={cn("cifra", CLASE_NIVEL_ROAS[nivelRoas(fila.roas)])}>
                          {textoRoas(fila.roas)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-secondary">Margen</dt>
                        <dd className="cifra text-text-primary">{textoMargen(fila.margen)}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla. El scroll horizontal, si hace falta, queda dentro. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <caption className="sr-only">
            Comparativa por tienda en el periodo. Pulsa una fila para ver esa tienda.
          </caption>
          <thead>
            <tr className="border-b border-border bg-base text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="px-3 py-2.5">Tienda</th>
              <th scope="col" className="px-3 py-2.5 text-right">Facturación</th>
              <th scope="col" className="px-3 py-2.5 text-right">Gastos</th>
              <th scope="col" className="px-3 py-2.5 text-right">Beneficio</th>
              <th scope="col" className="px-3 py-2.5 text-right">ROAS</th>
              <th scope="col" className="px-3 py-2.5 text-right">Margen</th>
              <th scope="col" className="w-8 px-2 py-2.5">
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const esGeneral = fila.tiendaId === null;
              return (
                <tr
                  key={fila.tiendaId ?? "general"}
                  onClick={() => ir(fila)}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2",
                    esGeneral && "bg-base/60",
                  )}
                >
                  <th scope="row" className="max-w-[240px] px-3 py-2.5 text-left font-normal">
                    {/* El botón da acceso por teclado; el clic en la fila es un atajo. */}
                    <button
                      type="button"
                      onClick={(evento) => {
                        evento.stopPropagation();
                        ir(fila);
                      }}
                      className="flex min-h-9 w-full items-center rounded-md text-left focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {nombre(fila)}
                    </button>
                  </th>
                  <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                    {esGeneral ? "—" : formatearEuros(fila.ingresos)}
                  </td>
                  <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                    {formatearEuros(fila.gastos)}
                  </td>
                  <td
                    className={cn(
                      "cifra px-3 py-2.5 text-right font-medium",
                      fila.beneficio >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {formatearEuros(fila.beneficio)}
                  </td>
                  <td
                    className={cn(
                      "cifra px-3 py-2.5 text-right",
                      esGeneral ? "text-text-muted" : CLASE_NIVEL_ROAS[nivelRoas(fila.roas)],
                    )}
                  >
                    {esGeneral ? "—" : textoRoas(fila.roas)}
                  </td>
                  <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                    {esGeneral ? "—" : textoMargen(fila.margen)}
                  </td>
                  <td className="px-2 py-2.5 text-text-muted">
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        General / Sociedad solo tiene gastos compartidos: no factura, así que no tiene ROAS
        ni margen. La suma de todas las filas es la de los indicadores de arriba.
      </p>
    </>
  );
}
