import { TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { FormularioDiario } from "@/components/diario/formulario-diario";
import { TablaDiario } from "@/components/diario/tabla-diario";
import { obtenerUltimaTasa, obtenerVentasDiarias } from "@/lib/consultas";

export const metadata = { title: "Registro diario" };

export default async function PaginaRegistroDiario() {
  const [{ filas, error }, ultimaTasa] = await Promise.all([
    obtenerVentasDiarias(30),
    obtenerUltimaTasa(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registro diario"
        descripcion="Las ventas del día, en menos de veinte segundos."
      />

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
        <TablaDiario filas={filas} />
      )}
    </div>
  );
}
