import "server-only";

import ExcelJS from "exceljs";

import type { FilaLibro, ResumenIva } from "@/lib/consultas-gestoria";

/**
 * Libro de ingresos y gastos en .xlsx, con el formato que espera una gestoría
 * española.
 *
 * Tres hojas: Ingresos, Gastos y Resumen.
 *
 * Los importes van como NÚMEROS con formato de celda, no como texto: la
 * gestoría necesita poder sumarlos y filtrarlos. El formato `#,##0.00 €` con
 * el locale del archivo en español hace que se vean con coma decimal.
 *
 * Al pie de cada hoja van los subtotales POR TIPO DE IVA, que es lo que hace
 * falta para el modelo 303, y una línea de cuadre que compara esa suma con el
 * total general. Si algún día no cuadrara, sale escrito en la hoja.
 */

const CABECERAS = [
  "Fecha",
  "Nº",
  "Concepto",
  "Categoría",
  "Base imponible",
  "% IVA",
  "Cuota IVA",
  "Total",
  "Divisa",
  "Tipo de cambio",
  "Total EUR",
];

const ANCHOS = [12, 6, 38, 24, 15, 8, 13, 13, 8, 14, 14];

const FORMATO_EUR = '#,##0.00 "€"';
const FORMATO_PCT = '0"%"';

function pintarCabecera(hoja: ExcelJS.Worksheet, titulo: string, periodo: string) {
  hoja.mergeCells(1, 1, 1, CABECERAS.length);
  const celdaTitulo = hoja.getCell(1, 1);
  celdaTitulo.value = titulo;
  celdaTitulo.font = { bold: true, size: 14 };

  hoja.mergeCells(2, 1, 2, CABECERAS.length);
  const celdaPeriodo = hoja.getCell(2, 1);
  celdaPeriodo.value = periodo;
  celdaPeriodo.font = { size: 10, color: { argb: "FF666666" } };

  const fila = hoja.getRow(4);
  fila.values = CABECERAS;
  fila.font = { bold: true };
  fila.eachCell((celda) => {
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEEEEE" },
    };
    celda.border = { bottom: { style: "thin" } };
  });

  ANCHOS.forEach((ancho, indice) => {
    hoja.getColumn(indice + 1).width = ancho;
  });

  // La cabecera se repite al imprimir en varias páginas.
  hoja.views = [{ state: "frozen", ySplit: 4 }];
}

function pintarFilas(hoja: ExcelJS.Worksheet, filas: FilaLibro[]): number {
  let numero = 0;
  let fila = 5;

  for (const registro of filas) {
    numero += 1;
    const f = hoja.getRow(fila);

    f.getCell(1).value = new Date(registro.fecha);
    f.getCell(1).numFmt = "dd/mm/yyyy";
    f.getCell(2).value = numero;
    f.getCell(3).value = registro.concepto;
    f.getCell(4).value = registro.categoria;
    f.getCell(5).value = Number(registro.base_imponible);
    f.getCell(5).numFmt = FORMATO_EUR;
    f.getCell(6).value = Number(registro.iva_tipo);
    f.getCell(6).numFmt = FORMATO_PCT;
    f.getCell(7).value = Number(registro.iva_importe);
    f.getCell(7).numFmt = FORMATO_EUR;
    f.getCell(8).value = Number(registro.total);
    f.getCell(8).numFmt = FORMATO_EUR;
    f.getCell(9).value = registro.divisa;
    f.getCell(10).value = Number(registro.tasa_cambio);
    f.getCell(10).numFmt = "0.000000";
    f.getCell(11).value = Number(registro.total_eur);
    f.getCell(11).numFmt = FORMATO_EUR;

    fila += 1;
  }

  return fila;
}

function pintarSubtotales(
  hoja: ExcelJS.Worksheet,
  desdeFila: number,
  bloque: ResumenIva["ingresos"],
  cuadre: ResumenIva["cuadre"]["ingresos"],
): void {
  let fila = desdeFila + 1;

  const titulo = hoja.getRow(fila);
  titulo.getCell(1).value = "SUBTOTALES POR TIPO DE IVA (para el modelo 303)";
  titulo.getCell(1).font = { bold: true };
  hoja.mergeCells(fila, 1, fila, 4);
  fila += 1;

  const cabecera = hoja.getRow(fila);
  cabecera.getCell(1).value = "Tipo de IVA";
  cabecera.getCell(2).value = "Operaciones";
  cabecera.getCell(3).value = "Base imponible EUR";
  cabecera.getCell(4).value = "Cuota IVA EUR";
  cabecera.getCell(5).value = "Total EUR";
  cabecera.font = { bold: true };
  fila += 1;

  for (const tramo of bloque.por_tipo) {
    const f = hoja.getRow(fila);
    f.getCell(1).value =
      tramo.tipo_iva === null ? "Otros tipos (no estándar)" : `${tramo.tipo_iva} %`;
    f.getCell(2).value = tramo.operaciones;
    f.getCell(3).value = Number(tramo.base);
    f.getCell(3).numFmt = FORMATO_EUR;
    f.getCell(4).value = Number(tramo.cuota);
    f.getCell(4).numFmt = FORMATO_EUR;
    f.getCell(5).value = Number(tramo.total);
    f.getCell(5).numFmt = FORMATO_EUR;

    if (tramo.tipo_iva === null) {
      f.font = { color: { argb: "FFB00000" }, bold: true };
    }
    fila += 1;
  }

  // Suma de los subtotales.
  const suma = hoja.getRow(fila);
  suma.getCell(1).value = "Suma de los subtotales";
  suma.getCell(2).value = bloque.operaciones;
  suma.getCell(3).value = Number(cuadre.suma_subtotales_base);
  suma.getCell(4).value = Number(cuadre.suma_subtotales_cuota);
  suma.getCell(5).value = Number(cuadre.suma_subtotales_total);
  [3, 4, 5].forEach((c) => (suma.getCell(c).numFmt = FORMATO_EUR));
  suma.font = { bold: true };
  suma.eachCell((celda) => (celda.border = { top: { style: "thin" } }));
  fila += 1;

  // Total general, calculado aparte.
  const total = hoja.getRow(fila);
  total.getCell(1).value = "TOTAL GENERAL";
  total.getCell(2).value = Number(bloque.operaciones);
  total.getCell(3).value = Number(cuadre.total_general_base);
  total.getCell(4).value = Number(cuadre.total_general_cuota);
  total.getCell(5).value = Number(cuadre.total_general_total);
  [3, 4, 5].forEach((c) => (total.getCell(c).numFmt = FORMATO_EUR));
  total.font = { bold: true };
  fila += 1;

  // Línea de cuadre. No se esconde nunca: si da cero, lo dice; si no, también.
  const cuadreFila = hoja.getRow(fila);
  cuadreFila.getCell(1).value = cuadre.cuadra
    ? "Cuadre: correcto (la suma de los subtotales coincide con el total general)"
    : "CUADRE: ¡DESCUADRE! Revisar antes de presentar nada";
  cuadreFila.getCell(3).value = Number(cuadre.descuadre_base);
  cuadreFila.getCell(4).value = Number(cuadre.descuadre_cuota);
  cuadreFila.getCell(5).value = Number(cuadre.descuadre_total);
  [3, 4, 5].forEach((c) => (cuadreFila.getCell(c).numFmt = FORMATO_EUR));
  cuadreFila.font = {
    bold: true,
    color: { argb: cuadre.cuadra ? "FF107C10" : "FFB00000" },
  };
  hoja.mergeCells(fila, 1, fila, 2);

  if (cuadre.hay_tipos_no_estandar) {
    fila += 2;
    const aviso = hoja.getRow(fila);
    aviso.getCell(1).value =
      "Aviso: hay operaciones con un tipo de IVA que no es 21 %, 10 %, 4 % ni 0 %. "
      + "Aparecen agrupadas como «Otros tipos» y hay que revisarlas una a una.";
    aviso.font = { color: { argb: "FFB00000" } };
    hoja.mergeCells(fila, 1, fila, 8);
  }
}

export async function generarLibroExcel(
  filas: FilaLibro[],
  resumen: ResumenIva,
  etiquetaPeriodo: string,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Dashboard Socios";
  libro.created = new Date();

  const periodo = `Periodo: ${etiquetaPeriodo} (${resumen.desde} a ${resumen.hasta})`;

  // ── Hoja de ingresos ─────────────────────────────────────────────────────
  const ingresos = libro.addWorksheet("Ingresos");
  pintarCabecera(ingresos, "Libro de ingresos", periodo);
  const finIngresos = pintarFilas(
    ingresos,
    filas.filter((f) => f.tipo === "ingreso"),
  );
  pintarSubtotales(ingresos, finIngresos, resumen.ingresos, resumen.cuadre.ingresos);

  // ── Hoja de gastos ───────────────────────────────────────────────────────
  const gastos = libro.addWorksheet("Gastos");
  pintarCabecera(gastos, "Libro de gastos", periodo);
  const finGastos = pintarFilas(gastos, filas.filter((f) => f.tipo === "gasto"));
  pintarSubtotales(gastos, finGastos, resumen.gastos, resumen.cuadre.gastos);

  // ── Hoja de resumen ──────────────────────────────────────────────────────
  const hojaResumen = libro.addWorksheet("Resumen");
  hojaResumen.getColumn(1).width = 44;
  hojaResumen.getColumn(2).width = 18;

  const titulo = hojaResumen.getCell("A1");
  titulo.value = "Resumen del periodo";
  titulo.font = { bold: true, size: 14 };
  hojaResumen.getCell("A2").value = periodo;

  const lineas: [string, number | string, boolean?][] = [
    ["", ""],
    ["INGRESOS", "", true],
    ["Operaciones", resumen.ingresos.operaciones],
    ["Base imponible", resumen.ingresos.base],
    ["IVA repercutido", resumen.ingresos.cuota],
    ["Total", resumen.ingresos.total],
    ["", ""],
    ["GASTOS", "", true],
    ["Operaciones", resumen.gastos.operaciones],
    ["Base imponible", resumen.gastos.base],
    ["IVA soportado", resumen.gastos.cuota],
    ["Total", resumen.gastos.total],
    ["", ""],
    ["LIQUIDACIÓN DE IVA", "", true],
    ["IVA repercutido", resumen.iva_repercutido],
    ["IVA soportado", resumen.iva_soportado],
    [
      resumen.diferencia >= 0 ? "Diferencia (a ingresar)" : "Diferencia (a compensar)",
      resumen.diferencia,
    ],
    ["", ""],
    ["RESULTADO", "", true],
    ["Resultado del periodo", Math.round((resumen.ingresos.total - resumen.gastos.total) * 100) / 100],
    ["", ""],
    ["CUADRE", "", true],
    [
      "Ingresos: subtotales frente al total",
      resumen.cuadre.ingresos.cuadra ? "Correcto" : "DESCUADRE",
    ],
    [
      "Gastos: subtotales frente al total",
      resumen.cuadre.gastos.cuadra ? "Correcto" : "DESCUADRE",
    ],
    ["", ""],
    [
      "Este documento es un resumen de apoyo, no un modelo oficial. "
        + "Debe revisarlo la gestoría antes de presentar nada.",
      "",
    ],
  ];

  let fila = 4;
  for (const [etiqueta, valor, negrita] of lineas) {
    const f = hojaResumen.getRow(fila);
    f.getCell(1).value = etiqueta;
    if (valor !== "") {
      f.getCell(2).value = valor;
      if (typeof valor === "number" && etiqueta !== "Operaciones") {
        f.getCell(2).numFmt = FORMATO_EUR;
      }
    }
    if (negrita) f.getCell(1).font = { bold: true };
    fila += 1;
  }

  const aviso = hojaResumen.getRow(fila - 1);
  aviso.getCell(1).font = { italic: true, color: { argb: "FFB00000" } };
  hojaResumen.mergeCells(fila - 1, 1, fila - 1, 4);

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
