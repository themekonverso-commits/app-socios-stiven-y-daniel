import { cn } from "@/lib/utils";
import { formatearEuros } from "@/lib/formato";
import type { TotalesFiltrados } from "@/lib/consultas";

/**
 * Ingresos, gastos y resultado del conjunto FILTRADO.
 * El texto lo dice explícitamente para que nadie lo confunda con el total
 * global del negocio.
 */
export function TiraTotales({ totales }: { totales: TotalesFiltrados }) {
  const positivo = totales.resultado >= 0;

  const celdas = [
    {
      etiqueta: "Ingresos",
      valor: formatearEuros(totales.ingresos),
      clase: "text-success",
    },
    {
      etiqueta: "Gastos",
      valor: formatearEuros(totales.gastos),
      clase: "text-danger",
    },
    {
      etiqueta: "Resultado",
      valor: formatearEuros(totales.resultado),
      clase: positivo ? "text-brand" : "text-danger",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {celdas.map((celda) => (
          <div key={celda.etiqueta} className="px-4 py-3">
            <p className="text-xs text-text-secondary">{celda.etiqueta}</p>
            <p className={cn("cifra mt-0.5 text-xl font-semibold", celda.clase)}>
              {celda.valor}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-4 py-1.5 text-[11px] text-text-muted">
        Sobre los resultados filtrados, no sobre el total del negocio.
      </p>
    </div>
  );
}
