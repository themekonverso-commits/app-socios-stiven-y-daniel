import { TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { AvisoRevisionMetodos } from "@/components/diario/aviso-revision-metodos";
import { FormularioDiario } from "@/components/diario/formulario-diario";
import { TablaDiario } from "@/components/diario/tabla-diario";
import {
  obtenerCoberturaVentas,
  obtenerRevisionMetodos,
  obtenerUltimaTasa,
  obtenerVentasDiarias,
} from "@/lib/consultas";

export const metadata = { title: "Registro diario" };

export default async function PaginaRegistroDiario() {
  const [{ filas, error }, ultimaTasa, cobertura, revision] = await Promise.all([
    obtenerVentasDiarias(30),
    obtenerUltimaTasa(),
    obtenerCoberturaVentas(30),
    obtenerRevisionMetodos(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registro diario"
        descripcion="Las ventas del día por método de cobro, en menos de veinte segundos."
      />

      {revision ? <AvisoRevisionMetodos dias={revision.dias} /> : null}

      <FormularioDiario ultimaTasa={ultimaTasa} />

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 font-medium text-danger">
            <TriangleAlert aria-hidden="true" className="size-4" />
            No se ha podido cargar el registro
          </p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </div>
      ) : (
        <TablaDiario filas={filas} cobertura={cobertura} />
      )}
    </div>
  );
}
