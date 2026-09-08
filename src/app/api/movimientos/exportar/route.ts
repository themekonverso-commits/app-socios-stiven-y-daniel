import { NextResponse, type NextRequest } from "next/server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { leerFiltros } from "@/lib/esquemas/filtros";
import { obtenerMovimientosParaExportar } from "@/lib/consultas";
import { formatearFecha } from "@/lib/formato";

/**
 * Exportación a CSV pensada para la gestoría.
 *
 * Separador punto y coma, decimales con coma y UTF-8 con BOM: es la única
 * combinación con la que el Excel en español abre el archivo bien de primeras,
 * sin pasar por el asistente de importación.
 */

const COLUMNAS = [
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
  "Total EUR",
  "Anticipado por",
  "Reembolsado",
  "Notas",
];

/** Decimales con coma, como espera el Excel español. */
function numero(valor: number | string | null, decimales = 2): string {
  const numerico = Number(valor ?? 0);
  if (!Number.isFinite(numerico)) return "";
  return numerico.toFixed(decimales).replace(".", ",");
}

/**
 * Escapa una celda. Además de las comillas, se neutraliza la inyección de
 * fórmulas: una celda que empiece por = + - @ la ejecutaría Excel al abrirla.
 */
function celda(valor: string | null | undefined): string {
  const texto = (valor ?? "").replace(/\r?\n/g, " ").trim();
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filtros = leerFiltros(params);
  const filas = await obtenerMovimientosParaExportar(filtros);

  const lineas = [
    COLUMNAS.join(";"),
    ...filas.map((fila) =>
      [
        celda(formatearFecha(fila.fecha)),
        celda(fila.tipo === "ingreso" ? "Ingreso" : "Gasto"),
        celda(fila.concepto),
        celda(fila.categorias?.nombre ?? ""),
        celda(fila.divisa),
        numero(fila.base_imponible),
        numero(fila.iva_tipo, 0),
        numero(fila.iva_importe),
        numero(fila.total),
        numero(fila.tasa_cambio, 6),
        numero(fila.total_eur),
        celda(fila.anticipado?.nombre ?? ""),
        celda(fila.reembolsado ? "Sí" : "No"),
        celda(fila.notas ?? ""),
      ].join(";"),
    ),
  ];

  // El BOM es lo que le dice a Excel que el archivo es UTF-8.
  const contenido = `﻿${lineas.join("\r\n")}\r\n`;
  const nombre = `movimientos_${filtros.desde}_a_${filtros.hasta}.csv`;

  return new NextResponse(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
