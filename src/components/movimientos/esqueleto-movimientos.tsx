import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de carga: mantiene la forma de la tabla, no un spinner suelto. */
export function EsqueletoMovimientos() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando movimientos…</span>

      <Skeleton className="h-[92px] w-full rounded-xl bg-surface-2" />

      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <div className="border-b border-border bg-surface px-4 py-3">
          <Skeleton className="h-4 w-40 bg-surface-2" />
        </div>
        {Array.from({ length: 8 }).map((_, indice) => (
          <div
            key={indice}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-20 bg-surface-2" />
            <Skeleton className="h-4 flex-1 bg-surface-2" />
            <Skeleton className="h-5 w-24 rounded-full bg-surface-2" />
            <Skeleton className="h-4 w-16 bg-surface-2" />
            <Skeleton className="h-4 w-24 bg-surface-2" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 5 }).map((_, indice) => (
          <Skeleton key={indice} className="h-24 w-full rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
