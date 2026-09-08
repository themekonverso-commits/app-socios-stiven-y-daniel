"use client";

import { Printer } from "lucide-react";

import { formatearEuros, formatearFecha, formatearFechaLarga } from "@/lib/formato";
import type { Cierre, ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * Acta imprimible de un cierre aprobado.
 *
 * No se genera un PDF con una librería: se imprime con el diálogo del navegador,
 * que ya sabe guardar en PDF. Menos dependencias, y el resultado es el mismo
 * documento firmado. Las reglas `print:` de más abajo dejan el acta en negro
 * sobre blanco y esconden todo lo demás.
 */
export function ActaCierre({
  cierre,
  socios,
}: {
  cierre: Cierre;
  socios: ResumenSocio[];
}) {
  const nombreDe = (id: string) =>
    socios.find((s) => s.socio_id === id)?.nombre ?? "Socio";

  const filas = [
    { etiqueta: "Ingresos del periodo", valor: cierre.ingresos_eur },
    { etiqueta: "Gastos del periodo", valor: cierre.gastos_eur },
    { etiqueta: "Resultado", valor: cierre.resultado_eur },
    { etiqueta: "Pérdidas previas", valor: cierre.perdidas_previas_eur },
    { etiqueta: "Anticipos pendientes", valor: cierre.anticipos_pendientes_eur },
    { etiqueta: "Base distribuible", valor: cierre.base_distribuible_eur },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface print:hidden"
      >
        <Printer aria-hidden="true" className="size-4" />
        Imprimir acta / Guardar PDF
      </button>

      {/* Solo se ve al imprimir. */}
      <article
        aria-hidden="true"
        className="hidden print:block print:p-8 print:text-black"
      >
        <header className="border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold">
            Acta de cierre trimestral · {cierre.etiqueta}
          </h1>
          <p className="mt-1 text-sm">
            Periodo del {formatearFecha(cierre.periodo_inicio)} al{" "}
            {formatearFecha(cierre.periodo_fin)}
          </p>
        </header>

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Cifras del periodo</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.etiqueta} className="border-b border-gray-300">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {fila.etiqueta}
                  </th>
                  <td className="py-1.5 text-right font-medium">
                    {formatearEuros(fila.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Decisión de reparto</h2>
          <p className="mt-2 text-sm">
            Se destina el {cierre.pct_reinversion} % a reinversión (
            {formatearEuros(cierre.importe_reinversion)}) y el{" "}
            {cierre.pct_reparto} % a reparto entre los socios (
            {formatearEuros(cierre.importe_reparto_total)}).
          </p>

          {Object.keys(cierre.reparto_por_socio ?? {}).length > 0 ? (
            <table className="mt-2 w-full border-collapse text-sm">
              <tbody>
                {Object.entries(cierre.reparto_por_socio).map(([id, importe]) => (
                  <tr key={id} className="border-b border-gray-300">
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {nombreDe(id)}
                    </th>
                    <td className="py-1.5 text-right font-medium">
                      {formatearEuros(importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        {cierre.notas ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Notas</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap">{cierre.notas}</p>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Aprobaciones</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {socios.map((socio) => {
              const firma = cierre.aprobaciones?.[socio.socio_id];
              return (
                <li key={socio.socio_id} className="border-b border-gray-300 pb-2 text-sm">
                  <span className="font-medium">{socio.nombre}</span>
                  <span className="ml-2">
                    {firma
                      ? `Aprobado el ${formatearFechaLarga(firma)}`
                      : "Sin firmar"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="mt-8 text-xs">
          Documento generado desde el panel de liquidación. Estado del cierre:{" "}
          {cierre.estado}.
        </footer>
      </article>
    </>
  );
}
