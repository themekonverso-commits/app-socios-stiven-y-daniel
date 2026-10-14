"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Layers, Plus, Settings2, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogoTienda } from "@/components/tiendas/dialogo-tienda";
import {
  useAmbito,
  useCambiarAmbito,
  useTiendas,
} from "@/components/tiendas/proveedor-tiendas";
import {
  COLOR_GENERAL,
  COLOR_TODAS,
  NOMBRE_GENERAL,
  NOMBRE_TODAS,
  SLUG_GENERAL,
  SLUG_TODAS,
  colorAmbito,
  nombreAmbito,
} from "@/lib/ambito";
import { cn } from "@/lib/utils";

/**
 * Selector de tienda. Arriba de la sidebar (escritorio) y en la barra
 * superior (móvil). Cambiar de tienda conserva la pantalla y sus filtros.
 */
export function SelectorTienda({
  compacto = false,
  alNavegar,
}: {
  /** Versión estrecha para la barra superior del móvil. */
  compacto?: boolean;
  alNavegar?: () => void;
}) {
  const tiendas = useTiendas();
  const ambito = useAmbito();
  const cambiar = useCambiarAmbito();
  const [dialogo, setDialogo] = useState(false);

  const visibles = tiendas.filter((t) => t.estado !== "archivada");
  const color = colorAmbito(ambito);
  const nombre = nombreAmbito(ambito);

  function elegir(slug: string, destino?: string) {
    alNavegar?.();
    cambiar(slug, destino);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Tienda activa: ${nombre}. Cambiar de tienda`}
            className={cn(
              "group flex min-h-11 w-full items-center gap-2.5 rounded-lg border bg-surface px-3 text-left text-sm transition-colors hover:bg-surface-2",
              compacto && "min-w-0 flex-1",
            )}
            // El color de la tienda, como acento del borde.
            style={{ borderColor: `${color}99`, boxShadow: `inset 3px 0 0 ${color}` }}
          >
            <IconoAmbito tipo={ambito.tipo} color={color} />
            <span className="min-w-0 flex-1">
              {!compacto ? (
                <span className="block text-[11px] leading-tight text-text-muted">
                  {ambito.tipo === "tienda" ? "Tienda" : "Vista"}
                </span>
              ) : null}
              <span className="block truncate font-medium text-text-primary">{nombre}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64">
          <Opcion
            activa={ambito.tipo === "todas"}
            onSelect={() => elegir(SLUG_TODAS)}
            icono={<IconoAmbito tipo="todas" color={COLOR_TODAS} />}
            texto={NOMBRE_TODAS}
            detalle="Consolidado"
          />

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            Tiendas
          </DropdownMenuLabel>
          {visibles.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-text-muted">Todavía no hay tiendas.</p>
          ) : null}
          {visibles.map((t) => (
            <Opcion
              key={t.id}
              activa={ambito.tipo === "tienda" && ambito.tienda.id === t.id}
              onSelect={() => elegir(t.slug)}
              icono={<IconoAmbito tipo="tienda" color={t.color} />}
              texto={t.nombre}
              detalle={t.estado === "pausada" ? "Pausada" : undefined}
              atenuada={t.estado === "pausada"}
            />
          ))}

          <DropdownMenuSeparator />
          <Opcion
            activa={ambito.tipo === "general"}
            onSelect={() => elegir(SLUG_GENERAL)}
            icono={<IconoAmbito tipo="general" color={COLOR_GENERAL} />}
            texto={NOMBRE_GENERAL}
            detalle="Gastos compartidos"
          />

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-10 gap-2.5"
            onSelect={() => {
              alNavegar?.();
              setDialogo(true);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Nueva tienda
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-10 gap-2.5"
            onSelect={() => elegir(ambito.slug, "/tiendas")}
          >
            <Settings2 aria-hidden="true" className="size-4" />
            Gestionar tiendas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoTienda abierto={dialogo} alCambiarAbierto={setDialogo} />
    </>
  );
}

function Opcion({
  activa,
  onSelect,
  icono,
  texto,
  detalle,
  atenuada,
}: {
  activa: boolean;
  onSelect: () => void;
  icono: React.ReactNode;
  texto: string;
  detalle?: string;
  atenuada?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      aria-current={activa ? "true" : undefined}
      className={cn("min-h-10 gap-2.5", atenuada && "opacity-60")}
    >
      {icono}
      <span className="min-w-0 flex-1 truncate">{texto}</span>
      {detalle ? <span className="text-xs text-text-muted">{detalle}</span> : null}
      {activa ? <Check aria-hidden="true" className="size-4 text-brand" /> : null}
    </DropdownMenuItem>
  );
}

/** Punto de color para las tiendas; icono para «Todas» y «General». */
export function IconoAmbito({
  tipo,
  color,
  className,
}: {
  tipo: "todas" | "general" | "tienda";
  color: string;
  className?: string;
}) {
  if (tipo === "todas") {
    return <Layers aria-hidden="true" className={cn("size-4 shrink-0", className)} style={{ color }} />;
  }
  if (tipo === "general") {
    return <Users aria-hidden="true" className={cn("size-4 shrink-0", className)} style={{ color }} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-3 shrink-0 rounded-full ring-2 ring-white/10", className)}
      style={{ backgroundColor: color }}
    />
  );
}
