import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { Cierre } from "@/lib/tipos-liquidacion";
import { sanearWinAnsi } from "@/lib/gestoria/texto-pdf";

/**
 * El acta del cierre, en PDF, para meterla en el paquete de la gestoría.
 *
 * La pantalla de liquidación imprime el acta con el diálogo del navegador, y
 * eso está bien para firmarla. Pero un ZIP necesita un archivo, así que aquí
 * se rehace el mismo documento con pdf-lib. Los números salen del cierre
 * guardado, no se recalculan: un cierre aprobado es inmutable y lo que valga
 * en pantalla tiene que valer aquí.
 */

const NEGRO = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.45, 0.45, 0.45);

function eur(valor: number): string {
  const negativo = valor < 0;
  const partes = Math.abs(valor).toFixed(2).split(".");
  const entera = partes[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${entera},${partes[1]} EUR`;
}

function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export async function generarActaPdf(
  cierre: Cierre,
  nombrePorSocio: Record<string, string>,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Acta de cierre ${cierre.etiqueta}`);

  const pagina = pdf.addPage([595.28, 841.89]);
  const { width, height } = pagina.getSize();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margen = 56;
  const fin = width - margen;
  let y = height - margen;

  const texto = (
    contenido: string,
    x: number,
    posY: number,
    o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) =>
    pagina.drawText(sanearWinAnsi(contenido), {
      x,
      y: posY,
      size: o.size ?? 10,
      font: o.bold ? negrita : normal,
      color: o.color ?? NEGRO,
    });

  const derecha = (
    contenido: string,
    xFin: number,
    posY: number,
    o: { size?: number; bold?: boolean } = {},
  ) => {
    const tam = o.size ?? 10;
    const fuente = o.bold ? negrita : normal;
    texto(contenido, xFin - fuente.widthOfTextAtSize(sanearWinAnsi(contenido), tam), posY, o);
  };

  texto(`Acta de cierre - ${cierre.etiqueta}`, margen, y, { size: 17, bold: true });
  y -= 16;
  texto(
    `Periodo del ${fecha(cierre.periodo_inicio)} al ${fecha(cierre.periodo_fin)}`,
    margen,
    y,
    { size: 10, color: GRIS },
  );
  y -= 12;
  texto(`Estado: ${cierre.estado.toUpperCase()}`, margen, y, { size: 10, color: GRIS });
  y -= 14;
  pagina.drawLine({
    start: { x: margen, y },
    end: { x: fin, y },
    thickness: 1.2,
    color: NEGRO,
  });
  y -= 24;

  const linea = (etiqueta: string, valor: number, bold = false) => {
    texto(etiqueta, margen, y, { size: 10, bold });
    derecha(eur(valor), fin, y, { size: 10, bold });
    y -= 16;
  };

  texto("Resultado del periodo", margen, y, { size: 11.5, bold: true });
  y -= 18;
  linea("Ingresos del periodo", cierre.ingresos_eur);
  linea("Gastos del periodo", cierre.gastos_eur);
  linea("Resultado", cierre.resultado_eur, true);
  linea("Pérdidas previas", cierre.perdidas_previas_eur);
  linea("Anticipos pendientes", cierre.anticipos_pendientes_eur);
  linea("Base distribuible", cierre.base_distribuible_eur, true);
  y -= 8;

  texto("Reparto acordado", margen, y, { size: 11.5, bold: true });
  y -= 18;
  texto(`Reinversión (${cierre.pct_reinversion} %)`, margen, y, { size: 10 });
  derecha(eur(cierre.importe_reinversion), fin, y, { size: 10 });
  y -= 16;
  texto(`Reparto entre socios (${cierre.pct_reparto} %)`, margen, y, { size: 10 });
  derecha(eur(cierre.importe_reparto_total), fin, y, { size: 10 });
  y -= 20;

  const reparto = Object.entries(cierre.reparto_por_socio ?? {});
  if (reparto.length === 0) {
    texto("Sin reparto: no había base distribuible.", margen, y, {
      size: 10,
      color: GRIS,
    });
    y -= 16;
  } else {
    for (const [id, importe] of reparto) {
      texto(nombrePorSocio[id] ?? "Socio", margen + 14, y, { size: 10 });
      derecha(eur(Number(importe)), fin, y, { size: 10, bold: true });
      y -= 16;
    }
  }
  y -= 12;

  texto("Aprobaciones", margen, y, { size: 11.5, bold: true });
  y -= 18;
  const aprobaciones = Object.entries(cierre.aprobaciones ?? {});
  if (aprobaciones.length === 0) {
    texto("Sin aprobaciones registradas.", margen, y, { size: 10, color: GRIS });
    y -= 16;
  } else {
    for (const [id, cuando] of aprobaciones) {
      texto(
        `${nombrePorSocio[id] ?? "Socio"} - aprobado el ${fecha(String(cuando))}`,
        margen + 14,
        y,
        { size: 10 },
      );
      y -= 16;
    }
  }

  if (cierre.notas) {
    y -= 12;
    texto("Notas", margen, y, { size: 11.5, bold: true });
    y -= 16;
    // Corte por ancho de linea; Helvetica mide de verdad, no por caracteres.
    const anchoMax = fin - margen;
    let acumulado = "";
    for (const palabra of cierre.notas.split(/\s+/)) {
      const prueba = acumulado ? `${acumulado} ${palabra}` : palabra;
      if (normal.widthOfTextAtSize(sanearWinAnsi(prueba), 10) > anchoMax) {
        texto(acumulado, margen, y, { size: 10 });
        y -= 14;
        acumulado = palabra;
      } else {
        acumulado = prueba;
      }
    }
    if (acumulado) texto(acumulado, margen, y, { size: 10 });
  }

  return Buffer.from(await pdf.save());
}
