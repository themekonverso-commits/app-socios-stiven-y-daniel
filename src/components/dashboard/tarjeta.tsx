import { cn } from "@/lib/utils";

/** Contenedor común de los bloques del dashboard: título, ayuda y contenido. */
export function TarjetaBloque({
  titulo,
  descripcion,
  accion,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
          {descripcion ? (
            <p className="mt-0.5 text-xs text-text-secondary">{descripcion}</p>
          ) : null}
        </div>
        {accion ? <div className="shrink-0">{accion}</div> : null}
      </div>
      {children}
    </section>
  );
}
