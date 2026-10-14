"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useTiendas } from "@/components/tiendas/proveedor-tiendas";
import { colorTienda, nombreTienda } from "@/lib/ambito";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { MovimientoCupo, ResumenSocio } from "@/lib/tipos-liquidacion";

/** Cuántos movimientos caben en el cuadro antes de mandar al listado. */
const MAXIMO_VISIBLES = 5;

/**
 * Todos los gastos con la tarjeta, de cualquier tienda: `tienda=todas` para
 * que /movimientos no los esconda tras la tienda que se tenga elegida.
 */
export const ENLACE_GASTOS_TARJETA = "/movimientos?medio=tarjeta_daniel&tienda=todas";

/**
 * R6 — el detalle que acompaña al widget del cupo de la tarjeta.
 *
 * Desde la 0018 el cupo NO es «lo máximo que un socio puede adelantar», ni
 * depende de la categoría: es el tope de la tarjeta de crédito, y lo consume
 * todo gasto pagado con ella (medio_pago = tarjeta_daniel), sea de la tienda
 * que sea o de General. Lo que un socio paga de su bolsillo se le reembolsa
 * exactamente igual, pero no gasta tarjeta: por eso se dice aquí con todas
 * las letras, para que nadie lea solo la barra y crea que ese dinero se ha
 * perdido.
 *
 * La barra, las cifras y el consumo por tienda los pinta `WidgetTarjeta`, en
 * tiempo real. Aquí van los últimos gastos con la tarjeta (con su tienda) y lo
 * anticipado de bolsillo.
 */
export function LimiteAportacion({
  socios,
  movimientos = [],
  totalMovimientos = 0,
}: {
  socios: ResumenSocio[];
  /** Los últimos gastos con la tarjeta, del más reciente al más antiguo. */
  movimientos?: MovimientoCupo[];
  /** Cuántos hay en total, para saber si hace falta el botón. */
  totalMovimientos?: number;
}) {
  const tiendas = useTiendas();
  const deBolsillo = socios.filter((s) => s.anticipado_otros > 0);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="cupo-movimientos" className="flex flex-col gap-2">
        <h3
          id="cupo-movimientos"
          className="text-xs font-semibold tracking-wide text-text-muted uppercase"
        >
          Últimos gastos con la tarjeta
        </h3>

        {movimientos.length === 0 ? (
          <p className="text-sm text-text-muted">
            Todavía no hay gastos pagados con la tarjeta.
          </p>
        ) : (
          <ul className="flex flex-col">
            {movimientos.slice(0, MAXIMO_VISIBLES).map((m) => (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text-primary">
                    {m.concepto}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
                    <span className="cifra">{formatearFecha(m.fecha)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{m.categoria}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colorTienda(m.tienda_id, tiendas) }}
                      />
                      {nombreTienda(m.tienda_id, tiendas)}
                    </span>
                  </span>
                </span>
                <span className="cifra shrink-0 text-sm font-medium text-text-primary">
                  {formatearEuros(m.total_eur)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {totalMovimientos > 0 ? (
          <Link
            href={ENLACE_GASTOS_TARJETA}
            className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
          >
            {totalMovimientos > MAXIMO_VISIBLES
              ? `Ver los ${totalMovimientos} gastos con la tarjeta`
              : "Ver los gastos con la tarjeta"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </section>

      {deBolsillo.length > 0 ? (
        <section
          aria-labelledby="cupo-bolsillo"
          className="flex flex-col gap-1.5 border-t border-border pt-4"
        >
          <h3
            id="cupo-bolsillo"
            className="text-xs font-semibold tracking-wide text-text-muted uppercase"
          >
            Anticipos de bolsillo
          </h3>
          <ul className="flex flex-col gap-1">
            {deBolsillo.map((s) => (
              <li key={s.socio_id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: s.color ?? "#6E6E73" }}
                    className="size-2 shrink-0 rounded-full"
                  />
                  {s.nombre}
                </span>
                <span className="cifra text-text-primary">{formatearEuros(s.anticipado_otros)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">
            Lo que cada socio pagó de su bolsillo se reembolsa igual que lo de la
            tarjeta, pero no consume el cupo.
          </p>
        </section>
      ) : null}
    </div>
  );
}
