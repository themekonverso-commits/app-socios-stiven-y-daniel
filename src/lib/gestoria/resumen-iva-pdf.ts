import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ResumenIva } from "@/lib/consultas-gestoria";
import { sanearWinAnsi } from "@/lib/gestoria/texto-pdf";

/**
 * Resumen de IVA en PDF.
 *
 * Se genera con `pdf-lib` en el SERVIDOR. El acta de cierre usa el diálogo de
 * impresión del navegador, que no sirve aquí: el paquete ZIP necesita un
 * archivo PDF de verdad, y eso no se puede producir desde una ventana de
 * impresión.
 *
 * La ADVERTENCIA va en la cabecera Y en el pie, en rojo y con recuadro. Este
 * documento va a acabar en manos de un asesor fiscal y no puede confundirse
 * con un modelo oficial ni por un momento.
 *
 * Fuente Helvetica estándar: su codificación WinAnsi cubre los acentos y la
 * eñe del español, así que no hace falta incrustar ninguna tipografía. Lo que
 * quede fuera (un emoji en una nota) pasa por `sanearWinAnsi` y no revienta
 * la descarga.
 */

const ADVERTENCIA_1 = "DOCUMENTO DE APOYO - NO ES UN MODELO OFICIAL";
const ADVERTENCIA_2 =
  "Debe revisarlo la gestoría antes de presentar nada ante la Agencia Tributaria.";

const ROJO = rgb(0.69, 0, 0);
const NEGRO = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.45, 0.45, 0.45);
const VERDE = rgb(0.06, 0.49, 0.06);

/** Euros con formato español, sin depender del locale del servidor. */
function eur(valor: number): string {
  const negativo = valor < 0;
  const partes = Math.abs(valor).toFixed(2).split(".");
  const entera = partes[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${entera},${partes[1]} EUR`;
}

function fecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function generarResumenIvaPdf(
  resumen: ResumenIva,
  etiquetaPeriodo: string,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Resumen de IVA ${etiquetaPeriodo}`);
  pdf.setSubject("Documento de apoyo. No es un modelo oficial.");

  const pagina = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = pagina.getSize();

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margen = 44;
  let y = height - margen;

  const texto = (
    contenido: string,
    x: number,
    posY: number,
    opciones: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    pagina.drawText(sanearWinAnsi(contenido), {
      x,
      y: posY,
      size: opciones.size ?? 10,
      font: opciones.bold ? negrita : normal,
      color: opciones.color ?? NEGRO,
    });
  };

  const derecha = (
    contenido: string,
    xFin: number,
    posY: number,
    opciones: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const tam = opciones.size ?? 10;
    const fuente = opciones.bold ? negrita : normal;
    const ancho = fuente.widthOfTextAtSize(sanearWinAnsi(contenido), tam);
    texto(contenido, xFin - ancho, posY, opciones);
  };

  // ── ADVERTENCIA DE CABECERA — recuadro rojo, lo primero que se ve ────────
  pagina.drawRectangle({
    x: margen,
    y: y - 46,
    width: width - margen * 2,
    height: 46,
    borderColor: ROJO,
    borderWidth: 1.5,
    color: rgb(1, 0.95, 0.95),
  });
  texto(ADVERTENCIA_1, margen + 12, y - 20, { size: 11, bold: true, color: ROJO });
  texto(ADVERTENCIA_2, margen + 12, y - 35, { size: 8.5, color: ROJO });
  y -= 70;

  // ── Título ───────────────────────────────────────────────────────────────
  texto("Resumen de IVA", margen, y, { size: 18, bold: true });
  y -= 18;
  texto(
    `${etiquetaPeriodo} - del ${fecha(resumen.desde)} al ${fecha(resumen.hasta)}`,
    margen,
    y,
    { size: 10, color: GRIS },
  );
  y -= 30;

  // ── Tabla por tipo impositivo ────────────────────────────────────────────
  const columnas = [margen, margen + 130, margen + 220, margen + 330, margen + 440];
  const finTabla = width - margen;

  const tabla = (titulo: string, bloque: ResumenIva["ingresos"], cuadre: ResumenIva["cuadre"]["ingresos"]) => {
    texto(titulo, margen, y, { size: 12, bold: true });
    y -= 16;

    pagina.drawLine({
      start: { x: margen, y: y + 10 },
      end: { x: finTabla, y: y + 10 },
      thickness: 0.5,
      color: GRIS,
    });

    texto("Tipo", columnas[0]!, y, { size: 9, bold: true, color: GRIS });
    texto("Operaciones", columnas[1]!, y, { size: 9, bold: true, color: GRIS });
    derecha("Base imponible", columnas[3]! - 10, y, { size: 9, bold: true, color: GRIS });
    derecha("Cuota IVA", columnas[4]! - 10, y, { size: 9, bold: true, color: GRIS });
    derecha("Total", finTabla, y, { size: 9, bold: true, color: GRIS });
    y -= 14;

    if (bloque.por_tipo.length === 0) {
      texto("Sin operaciones en el periodo.", columnas[0]!, y, { size: 9, color: GRIS });
      y -= 14;
    }

    for (const tramo of bloque.por_tipo) {
      const esOtros = tramo.tipo_iva === null;
      const color = esOtros ? ROJO : NEGRO;

      texto(esOtros ? "Otros (no estándar)" : `${tramo.tipo_iva} %`, columnas[0]!, y, {
        size: 9.5,
        color,
        bold: esOtros,
      });
      texto(String(tramo.operaciones), columnas[1]!, y, { size: 9.5, color });
      derecha(eur(tramo.base), columnas[3]! - 10, y, { size: 9.5, color });
      derecha(eur(tramo.cuota), columnas[4]! - 10, y, { size: 9.5, color });
      derecha(eur(tramo.total), finTabla, y, { size: 9.5, color });
      y -= 14;
    }

    pagina.drawLine({
      start: { x: margen, y: y + 8 },
      end: { x: finTabla, y: y + 8 },
      thickness: 0.5,
      color: GRIS,
    });
    y -= 6;

    texto("TOTAL", columnas[0]!, y, { size: 9.5, bold: true });
    texto(String(bloque.operaciones), columnas[1]!, y, { size: 9.5, bold: true });
    derecha(eur(bloque.base), columnas[3]! - 10, y, { size: 9.5, bold: true });
    derecha(eur(bloque.cuota), columnas[4]! - 10, y, { size: 9.5, bold: true });
    derecha(eur(bloque.total), finTabla, y, { size: 9.5, bold: true });
    y -= 16;

    // Línea de cuadre: siempre visible, cuadre o no.
    texto(
      cuadre.cuadra
        ? "Cuadre correcto: la suma de los subtotales coincide con el total general."
        : `DESCUADRE de ${eur(cuadre.descuadre_total)} entre los subtotales y el total general. Revisar.`,
      columnas[0]!,
      y,
      { size: 8.5, color: cuadre.cuadra ? VERDE : ROJO, bold: !cuadre.cuadra },
    );
    y -= 24;
  };

  tabla("IVA repercutido (ingresos)", resumen.ingresos, resumen.cuadre.ingresos);
  tabla("IVA soportado (gastos)", resumen.gastos, resumen.cuadre.gastos);

  // ── Liquidación ──────────────────────────────────────────────────────────
  const aIngresar = resumen.diferencia >= 0;

  pagina.drawRectangle({
    x: margen,
    y: y - 62,
    width: width - margen * 2,
    height: 62,
    borderColor: GRIS,
    borderWidth: 0.8,
  });

  texto("Liquidación del periodo", margen + 12, y - 18, { size: 11, bold: true });
  texto("IVA repercutido", margen + 12, y - 34, { size: 9.5, color: GRIS });
  derecha(eur(resumen.iva_repercutido), finTabla - 12, y - 34, { size: 9.5 });
  texto("IVA soportado", margen + 12, y - 47, { size: 9.5, color: GRIS });
  derecha(eur(resumen.iva_soportado), finTabla - 12, y - 47, { size: 9.5 });

  y -= 78;
  texto(aIngresar ? "Diferencia A INGRESAR" : "Diferencia A COMPENSAR", margen, y, {
    size: 11,
    bold: true,
  });
  derecha(eur(Math.abs(resumen.diferencia)), finTabla, y, { size: 13, bold: true });
  y -= 26;

  if (resumen.cuadre.ingresos.hay_tipos_no_estandar || resumen.cuadre.gastos.hay_tipos_no_estandar) {
    texto(
      "Aviso: hay operaciones con un tipo de IVA que no es 21%, 10%, 4% ni 0%.",
      margen,
      y,
      { size: 9, color: ROJO, bold: true },
    );
    y -= 12;
    texto(
      "Aparecen agrupadas como «Otros» y hay que revisarlas una a una.",
      margen,
      y,
      { size: 9, color: ROJO },
    );
  }

  // ── ADVERTENCIA DE PIE — la misma, para que no se escape ─────────────────
  pagina.drawRectangle({
    x: margen,
    y: margen,
    width: width - margen * 2,
    height: 46,
    borderColor: ROJO,
    borderWidth: 1.5,
    color: rgb(1, 0.95, 0.95),
  });
  texto(ADVERTENCIA_1, margen + 12, margen + 28, { size: 10, bold: true, color: ROJO });
  texto(ADVERTENCIA_2, margen + 12, margen + 14, { size: 8, color: ROJO });

  texto(
    `Generado el ${new Date().toLocaleDateString("es-ES")} desde el panel de socios.`,
    margen,
    margen + 56,
    { size: 7.5, color: GRIS },
  );

  return Buffer.from(await pdf.save());
}
