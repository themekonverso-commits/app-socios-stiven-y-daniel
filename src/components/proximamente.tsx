import { Construction } from "lucide-react";

/**
 * Marcador para las pantallas que llegan en fases posteriores. La ruta ya
 * existe y navega; el contenido todavía no.
 */
export function Proximamente({ fase }: { fase: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"
      >
        <Construction className="size-6" />
      </span>

      <p className="mt-4 text-base font-semibold text-text-primary">
        Próximamente
      </p>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        Esta pantalla se construye en la fase {fase}. Por ahora la ruta existe y
        la navegación ya funciona.
      </p>
    </div>
  );
}
