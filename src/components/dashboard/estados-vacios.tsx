import Link from "next/link";
import { CalendarPlus, Store, Users } from "lucide-react";

import { EstadoVacio } from "@/components/estado-vacio";
import { BotonNuevoMovimiento } from "@/components/movimientos/boton-nuevo-movimiento";
import { conTienda } from "@/lib/ambito";

/**
 * Tienda recién creada, sin un solo movimiento. En lugar de seis tarjetas a
 * cero y gráficos vacíos, una invitación a empezar.
 */
export function TiendaVacia({ nombre, slug }: { nombre: string; slug: string }) {
  return (
    <EstadoVacio
      icono={Store}
      titulo={`${nombre} todavía no tiene movimientos`}
      descripcion="Registra el primer gasto o ingreso de la tienda, o anota las ventas de su primer día en el registro diario. Los indicadores aparecerán en cuanto haya datos."
      accion={
        <div className="flex flex-wrap justify-center gap-2">
          <BotonNuevoMovimiento etiqueta="Registrar el primer movimiento" />
          <Link
            href={conTienda("/diario", slug)}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Registrar el primer día
          </Link>
        </div>
      }
    />
  );
}

/** «General / Sociedad» sin ningún gasto compartido todavía. */
export function GeneralVacio() {
  return (
    <EstadoVacio
      icono={Users}
      titulo="Todavía no hay gastos compartidos"
      descripcion="Aquí van los gastos que no son de ninguna tienda: herramientas como Claude o Apimart, la gestoría… Al registrarlos, elige «General / Sociedad» como tienda."
      accion={<BotonNuevoMovimiento etiqueta="Registrar un gasto compartido" />}
    />
  );
}

/**
 * La tienda ya tiene movimientos pero ningún registro diario de ventas: sin
 * él no hay pedidos, ni ticket medio, ni CPA.
 */
export function AvisoSinDiario({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
        >
          <CalendarPlus className="size-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Esta tienda aún no tiene ventas en el registro diario
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Anota cada día lo que vendió y cuántos pedidos: con eso salen el ticket medio, el
            CPA y lo pendiente de cobro.
          </p>
        </div>
      </div>
      <Link
        href={conTienda("/diario", slug)}
        className="flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        Registrar el primer día
      </Link>
    </div>
  );
}
