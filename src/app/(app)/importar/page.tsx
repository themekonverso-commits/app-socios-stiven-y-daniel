import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { AsistenteImportacion } from "@/components/importar/asistente-importacion";
import { HistorialImportaciones } from "@/components/importar/historial-importaciones";
import {
  obtenerImportaciones,
  obtenerMapeos,
} from "@/lib/consultas-importacion";
import { obtenerCategorias, obtenerUltimaTasa } from "@/lib/consultas";

export const metadata = { title: "Importar" };

export default async function PaginaImportar() {
  const [categorias, mapeos, importaciones, tasa] = await Promise.all([
    obtenerCategorias(),
    obtenerMapeos(),
    obtenerImportaciones(),
    obtenerUltimaTasa(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Importar"
        descripcion="Vuelca un CSV de Shopify o de cualquier plataforma y conviértelo en movimientos."
      />

      <TarjetaBloque
        titulo="Nueva importación"
        descripcion="Cinco pasos. Nada se guarda hasta el último."
      >
        <AsistenteImportacion
          categorias={categorias}
          mapeos={mapeos}
          tasaUsd={tasa?.tasa ?? null}
        />
      </TarjetaBloque>

      <TarjetaBloque
        titulo="Importaciones anteriores"
        descripcion="Se pueden deshacer mientras sus movimientos no entren en un cierre aprobado ni en un reembolso."
      >
        <HistorialImportaciones importaciones={importaciones} />
      </TarjetaBloque>
    </div>
  );
}
