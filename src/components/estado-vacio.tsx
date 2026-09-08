import type { LucideIcon } from "lucide-react";

export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"
      >
        <Icono className="size-6" />
      </span>
      <p className="mt-4 text-base font-semibold text-text-primary">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">{descripcion}</p>
      {accion ? <div className="mt-5">{accion}</div> : null}
    </div>
  );
}
