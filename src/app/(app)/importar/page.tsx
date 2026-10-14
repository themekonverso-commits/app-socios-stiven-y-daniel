import { Archive } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { AsistenteImportacion } from "@/components/importar/asistente-importacion";
import { HistorialImportaciones } from "@/components/importar/historial-importaciones";
import { AvisoElegirTienda } from "@/components/movimientos/aviso-elegir-tienda";
import {
  obtenerImportaciones,
  obtenerMapeos,
} from "@/lib/consultas-importacion";
import { obtenerCategorias, obtenerUltimaTasa } from "@/lib/consultas";
import { obtenerAmbito } from "@/lib/tiendas";

export const metadata = { title: "Importar" };

/**
 * Importación de CSV. Siempre en UNA tienda: en «Todas» o «General» se pide
 * elegirla (en «Todas» se ve igualmente el historial de todas).
 */
export default async function PaginaImportar() {
  const ambito = await obtenerAmbito();
  const tienda = ambito.tipo === "tienda" ? ambito.tienda : null;

  const descripcion =
    "Vuelca un CSV de Shopify o de cualquier plataforma y conviértelo en movimientos.";

  if (ambito.tipo === "general") {
    return (
      <div className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Importar" descripcion={descripcion} />
        <AvisoElegirTienda
          titulo="Elige la tienda en la que quieres importar"
          descripcion="Cada importación crea los movimientos en una tienda concreta."
        />
      </div>
    );
  }

  const [categorias, mapeos, importaciones, tasa] = await Promise.all([
    obtenerCategorias(),
    tienda ? obtenerMapeos(ambito) : Promise.resolve([]),
    obtenerImportaciones(ambito),
    obtenerUltimaTasa(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Importar" descripcion={descripcion} />

      {!tienda ? (
        <AvisoElegirTienda
          titulo="Elige la tienda en la que quieres importar"
          descripcion="Cada importación crea los movimientos en una tienda concreta, y los duplicados se buscan dentro de ella."
        />
      ) : tienda.estado === "archivada" ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <p>
            <span className="font-medium text-text-primary">{tienda.nombre}</span> está
            archivada: no admite importaciones nuevas.
          </p>
        </div>
      ) : (
        <TarjetaBloque
          titulo={`Nueva importación en ${tienda.nombre}`}
          descripcion="Cinco pasos. Nada se guarda hasta el último."
        >
          {/* La clave reinicia el asistente al cambiar de tienda. */}
          <AsistenteImportacion
            key={tienda.id}
            tienda={{ id: tienda.id, nombre: tienda.nombre }}
            categorias={categorias}
            mapeos={mapeos}
            tasaUsd={tasa?.tasa ?? null}
          />
        </TarjetaBloque>
      )}

      <TarjetaBloque
        titulo="Importaciones anteriores"
        descripcion="Se pueden deshacer mientras sus movimientos no entren en un cierre aprobado ni en un reembolso."
      >
        <HistorialImportaciones
          importaciones={importaciones}
          conTienda={!tienda}
          nombreTienda={tienda?.nombre ?? null}
        />
      </TarjetaBloque>
    </div>
  );
}
