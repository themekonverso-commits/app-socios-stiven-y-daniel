import { NextResponse, type NextRequest } from "next/server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { leerFiltrosCuentas } from "@/lib/esquemas/cuentas";
import { obtenerCuentas } from "@/lib/consultas-cuentas";
import { formatearFecha } from "@/lib/formato";

/**
 * CSV del inventario, con los mismos filtros de la vista y el mismo formato
 * español que /movimientos: punto y coma, decimales con coma y UTF-8 con BOM.
 *
 * No exporta ninguna credencial porque no existe ninguna: esto es un
 * inventario, no un gestor de contraseñas.
 */

const COLUMNAS = [
  "Nombre",
  "Tipo",
  "Correo asociado",
  "URL",
  "Titular",
  "Coste",
  "Divisa",
  "Coste EUR",
  "Coste mensual EUR",
  "Periodicidad",
  "Renovación",
  "Días de aviso",
  "Último pago",
  "Categoría de gasto",
  "Estado",
  "Notas",
];

function numero(valor: unknown, decimales = 2): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(decimales).replace(".", ",");
}

/** Neutraliza la inyección de fórmulas: Excel ejecuta lo que empieza por = + - @ */
function celda(valor: unknown): string {
  const texto = String(valor ?? "").replace(/\r?\n/g, " ").trim();
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filtros = leerFiltrosCuentas(params);
  const cuentas = await obtenerCuentas(filtros);

  const lineas = [
    COLUMNAS.join(";"),
    ...cuentas.map((c) =>
      [
        celda(c.nombre),
        celda(c.tipo),
        celda(c.email_asociado),
        celda(c.url),
        celda(c.titular_nombre),
        c.coste === null ? "" : numero(c.coste),
        celda(c.divisa),
        numero(c.coste_eur),
        numero(c.coste_mensual_eur),
        celda(c.periodicidad),
        celda(c.fecha_renovacion ? formatearFecha(String(c.fecha_renovacion)) : ""),
        numero(c.aviso_dias, 0),
        celda(c.ultimo_pago ? formatearFecha(String(c.ultimo_pago)) : ""),
        celda(c.categoria_nombre),
        celda(c.estado),
        celda(c.notas),
      ].join(";"),
    ),
  ];

  const contenido = `﻿${lineas.join("\r\n")}\r\n`;
  const nombre = `cuentas_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
