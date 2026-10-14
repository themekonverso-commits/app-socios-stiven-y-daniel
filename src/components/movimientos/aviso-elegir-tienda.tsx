"use client";

import { Store } from "lucide-react";

import { IconoAmbito } from "@/components/tiendas/selector-tienda";
import {
  useAmbito,
  useCambiarAmbito,
  useTiendas,
} from "@/components/tiendas/proveedor-tiendas";
import { NOMBRE_GENERAL } from "@/lib/ambito";

/**
 * Para las pantallas que solo tienen sentido dentro de UNA tienda (registro
 * diario, importación): en «Todas» o en «General» no se sabe a qué tienda
 * irían los datos, así que en lugar del formulario se pide elegirla.
 *
 * Cada botón cambia el ámbito sin salir de la pantalla.
 */
export function AvisoElegirTienda({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  const ambito = useAmbito();
  const tiendas = useTiendas();
  const cambiar = useCambiarAmbito();

  const activas = tiendas.filter((t) => t.estado === "activa");
  const pausadas = tiendas.filter((t) => t.estado === "pausada");
  const elegibles = [...activas, ...pausadas];

  return (
    <section
      aria-labelledby="aviso-elegir-tienda"
      className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"
      >
        <Store className="size-6" />
      </span>
      <h2 id="aviso-elegir-tienda" className="mt-4 text-base font-semibold text-text-primary">
        {titulo}
      </h2>
      <p className="mt-1 max-w-md text-sm text-text-secondary">
        {descripcion}
        {ambito.tipo === "general"
          ? ` ${NOMBRE_GENERAL} es para los gastos compartidos: aquí no aplica.`
          : ""}
      </p>

      {elegibles.length > 0 ? (
        <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
          {elegibles.map((tienda) => (
            <button
              key={tienda.id}
              type="button"
              onClick={() => cambiar(tienda.slug)}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-base"
            >
              <IconoAmbito tipo="tienda" color={tienda.color} className="size-2.5" />
              {tienda.nombre}
              {tienda.estado === "pausada" ? (
                <span className="text-xs font-normal text-text-muted">(pausada)</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          No hay ninguna tienda activa. Crea una desde el selector de tienda.
        </p>
      )}
    </section>
  );
}
