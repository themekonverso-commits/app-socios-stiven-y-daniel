"use client";

import { useState } from "react";
import { Store } from "lucide-react";

import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { FormularioCobro } from "@/components/cobros/formulario-cobro";
import { FormularioTraspaso } from "@/components/cobros/formulario-traspaso";
import { IconoAmbito } from "@/components/tiendas/selector-tienda";
import {
  useAmbito,
  useCambiarAmbito,
  useTiendas,
} from "@/components/tiendas/proveedor-tiendas";

type Que = "cobro" | "traspaso";

/**
 * Un solo bloque para las dos altas de /cobros: un cobro o un traspaso.
 *
 * Un cobro es siempre de una tienda: en «Todas» o «General» no se enseña el
 * formulario, sino un aviso para elegir la tienda. El traspaso PayPal → Banco
 * es de la sociedad y se registra desde cualquier vista.
 */
export function PanelRegistro() {
  const [que, setQue] = useState<Que>("cobro");
  const ambito = useAmbito();

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          {que === "cobro" ? "Registrar un cobro" : "Traspaso PayPal → Banco"}
        </h2>
        <SelectorSegmentado
          nombre="registro-cobros"
          etiquetaGrupo="Qué quieres registrar"
          valor={que}
          opciones={[
            { valor: "cobro", etiqueta: "Cobro" },
            { valor: "traspaso", etiqueta: "Traspaso PayPal → Banco" },
          ]}
          alCambiar={setQue}
          className="sm:w-96"
        />
      </div>
      <div className="mt-3">
        {que === "traspaso" ? (
          <FormularioTraspaso />
        ) : ambito.tipo === "tienda" ? (
          ambito.tienda.estado === "archivada" ? (
            <p className="text-sm text-text-secondary">
              {ambito.tienda.nombre} está archivada: no admite cobros nuevos.
            </p>
          ) : (
            // La clave reinicia el formulario al cambiar de tienda.
            <FormularioCobro key={ambito.tienda.id} tienda={ambito.tienda} />
          )
        ) : (
          <ElegirTienda general={ambito.tipo === "general"} />
        )}
      </div>
    </section>
  );
}

/** Aviso en «Todas» y «General»: un cobro necesita una tienda concreta. */
function ElegirTienda({ general }: { general: boolean }) {
  const tiendas = useTiendas().filter((t) => t.estado !== "archivada");
  const cambiar = useCambiarAmbito();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-base p-4">
      <p className="flex items-start gap-2 text-sm text-text-secondary">
        <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <span>
          {general
            ? "General / Sociedad no tiene ventas: un cobro siempre es de una tienda, y solo concilia con las ventas de esa tienda."
            : "Un cobro siempre es de una tienda, y solo concilia con las ventas de esa tienda."}{" "}
          Elige en qué tienda quieres registrarlo.
        </span>
      </p>
      {tiendas.length === 0 ? (
        <p className="text-sm text-text-muted">Todavía no hay tiendas activas.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tiendas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => cambiar(t.slug)}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
              >
                <IconoAmbito tipo="tienda" color={t.color} />
                {t.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
