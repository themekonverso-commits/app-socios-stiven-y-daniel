"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { LIMITE_FILAS, leerCsv, type ResultadoLectura } from "@/lib/csv";

/**
 * Paso 1 — subida.
 *
 * Es una etiqueta con un input de archivo de verdad, no un div con onClick:
 * así funciona con teclado y lo anuncian los lectores de pantalla. El arrastre
 * es un extra encima, no el único camino.
 */
export function ZonaSubida({
  alLeer,
}: {
  alLeer: (archivo: File, resultado: ResultadoLectura) => void;
}) {
  const [encima, setEncima] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function procesar(archivo: File | undefined) {
    if (!archivo) return;

    if (!archivo.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se admiten archivos .csv. Si tienes un Excel, expórtalo primero a CSV.");
      return;
    }

    setError(null);
    setLeyendo(true);

    try {
      const resultado = await leerCsv(archivo);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      alLeer(archivo, resultado);
    } catch {
      setError("No se ha podido leer el archivo. Puede estar dañado.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(evento) => {
          evento.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setEncima(false);
          void procesar(evento.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          encima
            ? "border-brand bg-brand-soft"
            : "border-border bg-surface hover:bg-surface-2",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(evento) => void procesar(evento.target.files?.[0])}
        />

        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"
        >
          {leyendo ? (
            <FileSpreadsheet className="size-6 animate-pulse" />
          ) : (
            <Upload className="size-6" />
          )}
        </span>

        <span className="text-base font-semibold text-text-primary">
          {leyendo ? "Leyendo el archivo…" : "Arrastra aquí tu CSV"}
        </span>
        <span className="max-w-sm text-sm text-text-secondary">
          O pulsa para elegirlo. Máximo 5 MB y {LIMITE_FILAS.toLocaleString("es-ES")} filas.
          El separador y la codificación se detectan solos.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
