import { EtiquetaAmbito } from "@/components/tiendas/etiqueta-ambito";
import { cn } from "@/lib/utils";

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  className,
  alcance = "tienda",
}: {
  titulo: string;
  /**
   * «tienda»: la pantalla filtra por la tienda activa y su nombre va junto al
   * título. «global»: es de la sociedad (liquidación, categorías, ajustes…).
   */
  alcance?: "tienda" | "global";
  descripcion?: string;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // lg y no sm: dentro de la aplicación la sidebar se come 248px, así
        // que a 768px solo quedan ~520 y el título se partía en vertical
        // mientras las acciones ocupaban todo el ancho.
        "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xl font-semibold tracking-tight text-text-primary">
          <span>{titulo}</span>
          {alcance === "tienda" ? <EtiquetaAmbito /> : null}
        </h1>
        {descripcion ? (
          <p className="mt-1 text-sm text-text-secondary">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="shrink-0">{acciones}</div> : null}
    </div>
  );
}
