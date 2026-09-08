import Papa from "papaparse";

import { parsearNumeroEspanol, redondear2 } from "@/lib/dinero";

/**
 * Lectura de CSV.
 *
 * Los tres problemas reales de un CSV que llega de fuera:
 *   · el separador cambia (coma en Shopify, punto y coma en un Excel español)
 *   · la codificación cambia (UTF-8 en Shopify, Windows-1252 en Excel)
 *   · el formato de fecha y de número cambia (dd/mm/aaaa vs ISO, coma vs punto)
 *
 * Aquí se resuelven los tres. El parseo en sí lo hace papaparse, que sabe de
 * comillas, saltos de línea dentro de un campo y demás casos que a mano se
 * hacen mal.
 */

export const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
export const LIMITE_FILAS = 5000;

export type CampoDestino =
  | "fecha"
  | "concepto"
  | "importe"
  | "divisa"
  | "categoria"
  | "num_pedidos";

export const CAMPOS_DESTINO: { valor: CampoDestino; etiqueta: string; obligatorio: boolean }[] = [
  { valor: "fecha", etiqueta: "Fecha", obligatorio: true },
  { valor: "importe", etiqueta: "Importe", obligatorio: true },
  { valor: "concepto", etiqueta: "Concepto", obligatorio: false },
  { valor: "divisa", etiqueta: "Divisa", obligatorio: false },
  { valor: "categoria", etiqueta: "Categoría", obligatorio: false },
  { valor: "num_pedidos", etiqueta: "Nº de pedidos", obligatorio: false },
];

/**
 * Cabeceras habituales, por campo. Se reconocen las de Shopify y las
 * traducciones más comunes, para que el mapeo venga hecho de serie.
 */
const CABECERAS_CONOCIDAS: Record<CampoDestino, string[]> = {
  fecha: ["created at", "fecha", "date", "day", "día", "dia", "processed at", "paid at"],
  importe: ["total", "importe", "amount", "subtotal", "total price", "precio", "gross sales"],
  concepto: ["name", "concepto", "description", "descripción", "descripcion", "order", "pedido", "title"],
  divisa: ["currency", "divisa", "moneda"],
  categoria: ["categoría", "categoria", "category", "tipo"],
  num_pedidos: ["orders", "pedidos", "nº de pedidos", "n pedidos", "num_pedidos", "order count"],
};

export type ResultadoLectura = {
  cabeceras: string[];
  filas: Record<string, string>[];
  separador: string;
  codificacion: string;
  truncado: boolean;
  error: string | null;
};

/**
 * Decodifica el archivo probando UTF-8 primero.
 *
 * Si el resultado contiene el carácter de reemplazo (), el archivo no era
 * UTF-8: se reintenta con Windows-1252, que es lo que exporta Excel en español
 * y la causa habitual de los «Ã±» donde debería haber una eñe.
 */
function decodificar(buffer: ArrayBuffer): { texto: string; codificacion: string } {
  const bytes = new Uint8Array(buffer);

  // BOM de UTF-8: el archivo lo declara explícitamente.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      texto: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      codificacion: "UTF-8 (con BOM)",
    };
  }

  const comoUtf8 = new TextDecoder("utf-8").decode(bytes);
  if (!comoUtf8.includes("�")) {
    return { texto: comoUtf8, codificacion: "UTF-8" };
  }

  return {
    texto: new TextDecoder("windows-1252").decode(bytes),
    codificacion: "Windows-1252",
  };
}

export async function leerCsv(archivo: File): Promise<ResultadoLectura> {
  const vacio: ResultadoLectura = {
    cabeceras: [],
    filas: [],
    separador: "",
    codificacion: "",
    truncado: false,
    error: null,
  };

  if (archivo.size > LIMITE_BYTES) {
    return {
      ...vacio,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el límite son 5 MB. Pártelo en varios.`,
    };
  }

  const { texto, codificacion } = decodificar(await archivo.arrayBuffer());

  const resultado = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    // Cadena vacía = detección automática del separador.
    delimiter: "",
    transformHeader: (cabecera) => cabecera.trim(),
  });

  const cabeceras = (resultado.meta.fields ?? []).filter(Boolean);

  if (cabeceras.length === 0) {
    return {
      ...vacio,
      codificacion,
      error: "No se han encontrado cabeceras. ¿Seguro que es un CSV con la primera fila de títulos?",
    };
  }

  const todas = resultado.data.filter((fila) =>
    Object.values(fila).some((valor) => String(valor ?? "").trim() !== ""),
  );

  return {
    cabeceras,
    filas: todas.slice(0, LIMITE_FILAS),
    separador: resultado.meta.delimiter === "\t" ? "tabulador" : resultado.meta.delimiter,
    codificacion,
    truncado: todas.length > LIMITE_FILAS,
    error: null,
  };
}

/** Propone un mapeo mirando los nombres de las cabeceras. */
export function proponerMapeo(cabeceras: string[]): Partial<Record<CampoDestino, string>> {
  const mapeo: Partial<Record<CampoDestino, string>> = {};
  const usadas = new Set<string>();

  for (const [campo, alias] of Object.entries(CABECERAS_CONOCIDAS) as [
    CampoDestino,
    string[],
  ][]) {
    const encontrada = cabeceras.find((cabecera) => {
      if (usadas.has(cabecera)) return false;
      const normal = cabecera.trim().toLowerCase();
      return alias.some((a) => normal === a || normal.startsWith(`${a} `));
    });

    if (encontrada) {
      mapeo[campo] = encontrada;
      usadas.add(encontrada);
    }
  }

  return mapeo;
}

/** ¿Parece un export de Shopify? Sirve para etiquetar el origen. */
export function detectarOrigen(cabeceras: string[]): string {
  const normal = cabeceras.map((c) => c.trim().toLowerCase());
  const shopify = ["created at", "financial status", "lineitem name", "fulfillment status"];
  if (shopify.some((s) => normal.includes(s))) return "Shopify";
  return "CSV";
}

/**
 * Fecha a ISO. Acepta dd/mm/aaaa, aaaa-mm-dd y las marcas de tiempo con hora y
 * zona que exporta Shopify. Devuelve null si no la reconoce, para que la fila
 * se marque como error en lugar de importarse con una fecha inventada.
 */
export function parsearFecha(bruto: string): string | null {
  const texto = String(bruto ?? "").trim();
  if (!texto) return null;

  // aaaa-mm-dd, con lo que venga detrás (hora, zona).
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/aaaa o dd-mm-aaaa.
  const es = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (es) {
    const dia = es[1]!.padStart(2, "0");
    const mes = es[2]!.padStart(2, "0");
    if (Number(mes) > 12 || Number(dia) > 31) return null;
    return `${es[3]}-${mes}-${dia}`;
  }

  // Último recurso: que lo intente el navegador.
  const fecha = new Date(texto);
  if (!Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10);
  }

  return null;
}

/** Importe a número. Acepta «1.234,56», «1,234.56», «€ 45,00» y negativos. */
export function parsearImporte(bruto: string): number | null {
  const texto = String(bruto ?? "").trim();
  if (!texto) return null;

  const valor = parsearNumeroEspanol(texto.replace(/[^\d.,\-]/g, ""));
  if (valor === null) return null;

  return redondear2(valor);
}

export const DIVISAS_VALIDAS = ["EUR", "USD"] as const;

export function parsearDivisa(bruto: string): "EUR" | "USD" | null {
  const texto = String(bruto ?? "").trim().toUpperCase();
  if (!texto) return "EUR";
  if (texto === "EUR" || texto === "€") return "EUR";
  if (texto === "USD" || texto === "$") return "USD";
  return null;
}
