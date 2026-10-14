import { NextResponse, type NextRequest } from "next/server";

import { generarPaquete } from "@/lib/gestoria/paquete";
import { cargarActa, prepararExportacion } from "@/lib/gestoria/servidor";

/** Todo el trimestre del ámbito en un ZIP: Excel, CSV, PDF de IVA y acta del cierre. */
export async function GET(request: NextRequest) {
  const preparado = await prepararExportacion(request.nextUrl.searchParams);
  if (!preparado.ok) return preparado.respuesta;

  const { clave, etiqueta, nombreAmbito, sufijo, desde, hasta, filas, resumen } =
    preparado.contexto;
  const acta = await cargarActa(desde, hasta);
  const zip = await generarPaquete(filas, resumen, etiqueta, nombreAmbito, acta);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="gestoria-${clave}-${sufijo}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
