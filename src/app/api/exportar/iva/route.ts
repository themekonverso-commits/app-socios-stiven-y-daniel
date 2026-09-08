import { NextResponse, type NextRequest } from "next/server";

import { generarResumenIvaPdf } from "@/lib/gestoria/resumen-iva-pdf";
import { prepararExportacion } from "@/lib/gestoria/servidor";

/** Resumen de IVA del trimestre, en PDF. Documento de apoyo, no oficial. */
export async function GET(request: NextRequest) {
  const preparado = await prepararExportacion(request.nextUrl.searchParams);
  if (!preparado.ok) return preparado.respuesta;

  const { clave, etiqueta, resumen } = preparado.contexto;
  const pdf = await generarResumenIvaPdf(resumen, etiqueta);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resumen-iva-${clave}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
