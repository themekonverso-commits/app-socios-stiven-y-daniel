import { Skeleton } from "@/components/ui/skeleton";

export function EsqueletoTarjetas() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <span className="sr-only">Cargando indicadores…</span>
      {Array.from({ length: 6 }).map((_, indice) => (
        <Skeleton key={indice} className="h-[168px] w-full rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

export function EsqueletoBloque({ alto = 340 }: { alto?: number }) {
  return (
    <Skeleton
      aria-busy="true"
      style={{ height: alto }}
      className="w-full rounded-xl bg-surface-2"
    />
  );
}
