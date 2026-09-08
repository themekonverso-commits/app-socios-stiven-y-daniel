"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatearEntero,
  formatearEuros,
  formatearNumero,
} from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import { margen, dividir, calcularRoas } from "@/lib/kpis";
import type { FilaMensual } from "@/lib/consultas-kpi";

type Campo = keyof FilaMensual;

const COLUMNAS: { campo: Campo; etiqueta: string; alineada: "izq" | "der" }[] = [
  { campo: "mes", etiqueta: "Mes", alineada: "izq" },
  { campo: "ingresos", etiqueta: "Facturación", alineada: "der" },
  { campo: "gastos", etiqueta: "Gastos", alineada: "der" },
  { campo: "beneficio", etiqueta: "Beneficio", alineada: "der" },
  { campo: "margen", etiqueta: "Margen %", alineada: "der" },
  { campo: "gastoAds", etiqueta: "Gasto ads", alineada: "der" },
  { campo: "roas", etiqueta: "ROAS", alineada: "der" },
  { campo: "pedidos", etiqueta: "Pedidos", alineada: "der" },
  { campo: "ticketMedio", etiqueta: "Ticket medio", alineada: "der" },
];

function nombreMes(mes: string): string {
  if (!mes) return "—";
  try {
    return format(parseISO(mes), "MMMM yyyy", { locale: es });
  } catch {
    return mes;
  }
}

/** Decimales con coma y punto y coma de separador: el CSV que abre Excel. */
function celdaCsv(valor: string | number | null): string {
  if (valor === null) return "";
  if (typeof valor === "number") return valor.toFixed(2).replace(".", ",");
  return `"${valor.replace(/"/g, '""')}"`;
}

export function TablaMensual({ filas }: { filas: FilaMensual[] }) {
  const [orden, setOrden] = useState<Campo>("mes");
  const [ascendente, setAscendente] = useState(false);

  const ordenadas = useMemo(() => {
    const copia = [...filas];
    copia.sort((a, b) => {
      const va = a[orden];
      const vb = b[orden];
      // Los nulos siempre al final, ordene como ordene.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return ascendente
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      }
      return ascendente ? va - vb : vb - va;
    });
    return copia;
  }, [filas, orden, ascendente]);

  const totales = useMemo(() => {
    const ingresos = redondear2(filas.reduce((s, f) => s + f.ingresos, 0));
    const gastos = redondear2(filas.reduce((s, f) => s + f.gastos, 0));
    const gastoAds = redondear2(filas.reduce((s, f) => s + f.gastoAds, 0));
    const pedidos = filas.reduce((s, f) => s + f.pedidos, 0);
    const beneficio = redondear2(ingresos - gastos);

    return {
      ingresos,
      gastos,
      beneficio,
      gastoAds,
      pedidos,
      margen: margen(beneficio, ingresos),
      roas: calcularRoas(ingresos, gastoAds),
      ticketMedio: dividir(ingresos, pedidos, 2),
    };
  }, [filas]);

  function descargar() {
    const cabecera = COLUMNAS.map((c) => c.etiqueta).join(";");
    const lineas = ordenadas.map((f) =>
      [
        celdaCsv(nombreMes(f.mes)),
        celdaCsv(f.ingresos),
        celdaCsv(f.gastos),
        celdaCsv(f.beneficio),
        celdaCsv(f.margen),
        celdaCsv(f.gastoAds),
        celdaCsv(f.roas),
        celdaCsv(f.pedidos),
        celdaCsv(f.ticketMedio),
      ].join(";"),
    );
    const total = [
      celdaCsv("TOTAL"),
      celdaCsv(totales.ingresos),
      celdaCsv(totales.gastos),
      celdaCsv(totales.beneficio),
      celdaCsv(totales.margen),
      celdaCsv(totales.gastoAds),
      celdaCsv(totales.roas),
      celdaCsv(totales.pedidos),
      celdaCsv(totales.ticketMedio),
    ].join(";");

    // BOM al principio: sin él, Excel en español rompe los acentos.
    const contenido = `﻿${[cabecera, ...lineas, total].join("\r\n")}\r\n`;
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `comparativa_mensual_${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
        Todavía no hay meses con movimientos que comparar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={descargar}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
        >
          <Download aria-hidden="true" className="size-4" />
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <caption className="sr-only">
            Comparativa mensual de los últimos 12 meses
          </caption>
          <thead>
            <tr className="border-b border-border bg-base text-left">
              {COLUMNAS.map((columna) => {
                const activa = orden === columna.campo;
                const Icono = !activa ? ArrowUpDown : ascendente ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={columna.campo}
                    scope="col"
                    aria-sort={
                      activa ? (ascendente ? "ascending" : "descending") : "none"
                    }
                    className={cn(
                      "px-3 py-2.5",
                      columna.alineada === "der" && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (activa) setAscendente((v) => !v);
                        else {
                          setOrden(columna.campo);
                          setAscendente(false);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase transition-colors",
                        activa
                          ? "text-text-primary"
                          : "text-text-muted hover:text-text-secondary",
                      )}
                    >
                      {columna.etiqueta}
                      <Icono aria-hidden="true" className="size-3" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {ordenadas.map((fila) => (
              <tr key={fila.mes} className="border-b border-border last:border-b-0 hover:bg-base">
                <td className="px-3 py-2.5 text-text-primary capitalize">
                  {nombreMes(fila.mes)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {formatearEuros(fila.ingresos)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {formatearEuros(fila.gastos)}
                </td>
                <td
                  className={cn(
                    "cifra px-3 py-2.5 text-right font-medium",
                    fila.beneficio >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {formatearEuros(fila.beneficio)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {fila.margen === null ? "—" : `${formatearNumero(fila.margen)} %`}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {formatearEuros(fila.gastoAds)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {fila.roas === null ? "—" : `${formatearNumero(fila.roas)}x`}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {formatearEntero(fila.pedidos)}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {fila.ticketMedio === null ? "—" : formatearEuros(fila.ticketMedio)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border bg-base font-semibold">
              <td className="px-3 py-3 text-text-primary">Total</td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {formatearEuros(totales.ingresos)}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {formatearEuros(totales.gastos)}
              </td>
              <td
                className={cn(
                  "cifra px-3 py-3 text-right",
                  totales.beneficio >= 0 ? "text-success" : "text-danger",
                )}
              >
                {formatearEuros(totales.beneficio)}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {totales.margen === null ? "—" : `${formatearNumero(totales.margen)} %`}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {formatearEuros(totales.gastoAds)}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {totales.roas === null ? "—" : `${formatearNumero(totales.roas)}x`}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {formatearEntero(totales.pedidos)}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {totales.ticketMedio === null ? "—" : formatearEuros(totales.ticketMedio)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
