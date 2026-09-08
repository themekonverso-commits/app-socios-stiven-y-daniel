import "server-only";

import JSZip from "jszip";

import type { FilaLibro, ResumenIva } from "@/lib/consultas-gestoria";
import type { Cierre } from "@/lib/tipos-liquidacion";
import { generarActaPdf } from "@/lib/gestoria/acta-pdf";
import { generarLibroExcel } from "@/lib/gestoria/libro-excel";
import { generarResumenIvaPdf } from "@/lib/gestoria/resumen-iva-pdf";

/**
 * El ZIP que se le manda a la gestoría.
 *
 * Lleva los tres formatos porque cada gestoría trabaja distinto: el Excel para
 * quien revisa a mano, el CSV plano para quien lo importa en su programa de
 * contabilidad, y el PDF como resumen legible. Los tres salen de la MISMA
 * consulta, así que no pueden discrepar.
 *
 * El LEEME.txt de dentro repite la advertencia del PDF. Si alguien descomprime
 * el ZIP y solo abre el Excel, tiene que enterarse igual.
 */

function csvSeguro(valor: string | null | undefined): string {
  const texto = (valor ?? "").replace(/\r?\n/g, " ").trim();
  // Una celda que empiece por = + - @ la ejecutaría Excel al abrirla.
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

function num(valor: number | null | undefined, decimales = 2): string {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n.toFixed(decimales).replace(".", ",") : "";
}

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** El mismo libro que el Excel, en CSV plano para importadores. */
function generarLibroCsv(filas: FilaLibro[]): string {
  const cabecera = [
    "Fecha",
    "Tipo",
    "Concepto",
    "Categoría",
    "Divisa",
    "Base imponible",
    "Tipo IVA",
    "Importe IVA",
    "Total",
    "Tasa cambio",
    "Base EUR",
    "Cuota IVA EUR",
    "Total EUR",
    "Anticipado por",
    "Notas",
  ].join(";");

  const cuerpo = filas.map((f) =>
    [
      csvSeguro(fechaEs(f.fecha)),
      csvSeguro(f.tipo === "ingreso" ? "Ingreso" : "Gasto"),
      csvSeguro(f.concepto),
      csvSeguro(f.categoria),
      csvSeguro(f.divisa),
      num(f.base_imponible),
      num(f.iva_tipo, 0),
      num(f.iva_importe),
      num(f.total),
      num(f.tasa_cambio, 6),
      num(f.base_eur),
      num(f.cuota_eur),
      num(f.total_eur),
      csvSeguro(f.anticipado_por),
      csvSeguro(f.notas),
    ].join(";"),
  );

  // BOM: sin él, el Excel español abre los acentos rotos.
  return `﻿${[cabecera, ...cuerpo].join("\r\n")}\r\n`;
}

function generarLeeme(
  resumen: ResumenIva,
  etiqueta: string,
  hayActa: boolean,
): string {
  const c = resumen.cuadre;
  const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} EUR`;

  const cuadre = (nombre: string, bloque: typeof c.ingresos) =>
    bloque.cuadra
      ? `  ${nombre}: cuadra al céntimo.`
      : `  ${nombre}: DESCUADRE de ${eur(bloque.descuadre_total)} entre los subtotales por tipo y el total general. HAY QUE REVISARLO.`;

  return [
    "===========================================================",
    "  DOCUMENTO DE APOYO - NO ES UN MODELO OFICIAL",
    "  Debe revisarlo la gestoría antes de presentar nada ante",
    "  la Agencia Tributaria.",
    "===========================================================",
    "",
    `Periodo: ${etiqueta} (del ${fechaEs(resumen.desde)} al ${fechaEs(resumen.hasta)})`,
    "",
    "Contenido del paquete",
    "---------------------",
    "  libro.xlsx            Libro de ingresos y gastos, con hoja de resumen",
    "                        y subtotales por tipo de IVA.",
    "  libro.csv             Los mismos datos en texto plano (separador ';',",
    "                        decimales con coma, UTF-8 con BOM).",
    "  resumen-iva.pdf       Resumen de IVA repercutido y soportado.",
    hayActa
      ? "  acta-cierre.pdf       Acta del cierre aprobado del periodo."
      : "  (sin acta: no hay un cierre aprobado para este periodo)",
    "",
    "Cuadre de los subtotales",
    "------------------------",
    cuadre("Ingresos", c.ingresos),
    cuadre("Gastos", c.gastos),
    "",
    "Resumen de IVA",
    "--------------",
    `  IVA repercutido: ${eur(resumen.iva_repercutido)}`,
    `  IVA soportado:   ${eur(resumen.iva_soportado)}`,
    `  Diferencia:      ${eur(Math.abs(resumen.diferencia))} ${resumen.diferencia >= 0 ? "a ingresar" : "a compensar"}`,
    "",
    c.ingresos.hay_tipos_no_estandar || c.gastos.hay_tipos_no_estandar
      ? "AVISO: hay operaciones con un tipo de IVA que no es 21%, 10%, 4% ni 0%.\nAparecen agrupadas como \"Otros\" y hay que revisarlas una a una."
      : "",
    "",
    `Generado el ${new Date().toLocaleDateString("es-ES")} desde el panel de socios.`,
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export async function generarPaquete(
  filas: FilaLibro[],
  resumen: ResumenIva,
  etiqueta: string,
  cierre: (Cierre & { nombrePorSocio: Record<string, string> }) | null,
): Promise<Buffer> {
  const zip = new JSZip();

  const [excel, pdfIva] = await Promise.all([
    generarLibroExcel(filas, resumen, etiqueta),
    generarResumenIvaPdf(resumen, etiqueta),
  ]);

  zip.file("libro.xlsx", excel);
  zip.file("libro.csv", generarLibroCsv(filas));
  zip.file("resumen-iva.pdf", pdfIva);

  if (cierre) {
    const { nombrePorSocio, ...datos } = cierre;
    zip.file("acta-cierre.pdf", await generarActaPdf(datos, nombrePorSocio));
  }

  zip.file("LEEME.txt", generarLeeme(resumen, etiqueta, cierre !== null));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
