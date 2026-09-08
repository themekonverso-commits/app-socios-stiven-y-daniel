import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type Alerta = {
  nivel: "rojo" | "ambar" | "info";
  titulo: string;
  detalle: string;
  /** Enlace directo a donde se resuelve el aviso, si lo hay. */
  enlace?: { href: string; texto: string };
};

const ESTILO = {
  rojo: {
    caja: "border-danger/40 bg-danger/10",
    icono: "text-danger",
    Icono: CircleAlert,
    etiqueta: "Crítico",
  },
  ambar: {
    caja: "border-warning/40 bg-warning/10",
    icono: "text-warning",
    Icono: TriangleAlert,
    etiqueta: "Atención",
  },
  info: {
    caja: "border-border bg-surface-2",
    icono: "text-text-secondary",
    Icono: Info,
    etiqueta: "Aviso",
  },
} as const;

/**
 * Avisos calculados sobre los datos del periodo.
 *
 * Cada alerta lleva icono y una etiqueta de texto además del color: en una
 * pantalla que se mira de pasada, y para quien no distingue rojo de verde, el
 * color solo no basta.
 */
export function SemaforoAlertas({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="text-sm font-semibold text-success">Todo en orden</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            Ninguno de los umbrales de aviso se ha superado en este periodo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {alertas.map((alerta) => {
        const estilo = ESTILO[alerta.nivel];
        const Icono = estilo.Icono;

        return (
          <li
            key={alerta.titulo}
            className={cn("flex items-start gap-3 rounded-lg border p-4", estilo.caja)}
          >
            <Icono aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", estilo.icono)} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                {alerta.titulo}
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                    estilo.caja,
                    estilo.icono,
                  )}
                >
                  {estilo.etiqueta}
                </span>
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">{alerta.detalle}</p>
              {alerta.enlace ? (
                <Link
                  href={alerta.enlace.href}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand transition-colors hover:text-brand-hover"
                >
                  {alerta.enlace.texto} →
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
