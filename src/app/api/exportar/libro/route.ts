import { NextResponse, type NextRequest } from "next/server";

import { generarLibroExcel } from "@/lib/gestoria/libro-excel";
import { prepararExportacion } from "@/lib/gestoria/servidor";

/** Libro de ingresos y gastos del trimestre, en Excel. */
export async function GET(request: NextRequest) {
  const preparado = await prepararExportacion(request.nextUrl.searchParams);
  if (!preparado.ok) return preparado.respuesta;

  const { clave, etiqueta, filas, resumen } = preparado.contexto;
  const excel = await generarLibroExcel(filas, resumen, etiqueta);

  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libro-${clave}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
