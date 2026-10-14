"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, MoreHorizontal, Pause, Pencil, Play, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { borrarTienda, cambiarEstadoTienda } from "@/app/acciones/tiendas";
import { EstadoVacio } from "@/components/estado-vacio";
import { DialogoTienda } from "@/components/tiendas/dialogo-tienda";
import { IconoAmbito } from "@/components/tiendas/selector-tienda";
import { useCambiarAmbito } from "@/components/tiendas/proveedor-tiendas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLOR_GENERAL, NOMBRE_GENERAL, SLUG_GENERAL, type Tienda } from "@/lib/ambito";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import { cn } from "@/lib/utils";

export type MetricasTienda = { ingresos: number; gastos: number; beneficio: number };

const ETIQUETA_ESTADO = {
  activa: "Activa",
  pausada: "Pausada",
  archivada: "Archivada",
} as const;

export function GestorTiendas({
  tiendas,
  metricas,
  general,
  usuarioId,
}: {
  tiendas: Tienda[];
  metricas: Record<string, MetricasTienda>;
  general: MetricasTienda;
  usuarioId: string;
}) {
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<Tienda | null>(null);
  const cambiarAmbito = useCambiarAmbito();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setNueva(true)} className="min-h-11">
          <Plus aria-hidden="true" className="size-4" />
          Nueva tienda
        </Button>
      </div>

      {tiendas.length === 0 ? (
        <EstadoVacio
          icono={Store}
          titulo="Todavía no hay tiendas"
          descripcion="Crea la primera para empezar a registrar sus ventas y gastos."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {tiendas.map((t) => (
            <FilaTienda
              key={t.id}
              tienda={t}
              metricas={metricas[t.id] ?? { ingresos: 0, gastos: 0, beneficio: 0 }}
              esAutor={t.created_by === usuarioId}
              alEditar={() => setEditando(t)}
              alAbrir={() => cambiarAmbito(t.slug, "/")}
            />
          ))}
        </ul>
      )}

      {/* General no es una tienda: no se edita ni se archiva, pero se ve su gasto. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm">
        <span className="flex items-center gap-2.5 font-medium text-text-primary">
          <IconoAmbito tipo="general" color={COLOR_GENERAL} />
          {NOMBRE_GENERAL}
        </span>
        <span className="text-text-secondary">
          Gastos compartidos acumulados:{" "}
          <span className="cifra font-medium text-text-primary">{formatearEuros(general.gastos)}</span>
        </span>
        <button
          type="button"
          onClick={() => cambiarAmbito(SLUG_GENERAL, "/")}
          className="ml-auto min-h-11 text-sm font-medium text-brand hover:underline"
        >
          Ver
        </button>
      </div>

      <DialogoTienda abierto={nueva} alCambiarAbierto={setNueva} />
      <DialogoTienda
        abierto={editando !== null}
        alCambiarAbierto={(abierto) => !abierto && setEditando(null)}
        tienda={editando ?? undefined}
      />
    </div>
  );
}

function FilaTienda({
  tienda,
  metricas,
  esAutor,
  alEditar,
  alAbrir,
}: {
  tienda: Tienda;
  metricas: MetricasTienda;
  esAutor: boolean;
  alEditar: () => void;
  alAbrir: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const vacia = metricas.ingresos === 0 && metricas.gastos === 0;

  function estado(nuevo: "activa" | "pausada" | "archivada") {
    iniciar(async () => {
      const r = await cambiarEstadoTienda(tienda.id, nuevo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        nuevo === "archivada"
          ? `«${tienda.nombre}» archivada. Sus datos siguen en el consolidado.`
          : nuevo === "pausada"
            ? `«${tienda.nombre}» pausada.`
            : `«${tienda.nombre}» reactivada.`,
      );
      router.refresh();
    });
  }

  function borrar() {
    iniciar(async () => {
      const r = await borrarTienda(tienda.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`«${tienda.nombre}» borrada.`);
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center",
        tienda.estado === "archivada" && "opacity-60",
        pendiente && "opacity-70",
      )}
      style={{ boxShadow: `inset 4px 0 0 ${tienda.color}` }}
    >
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex flex-wrap items-center gap-2">
          <IconoAmbito tipo="tienda" color={tienda.color} />
          <button
            type="button"
            onClick={alAbrir}
            className="truncate text-base font-semibold text-text-primary hover:underline"
          >
            {tienda.nombre}
          </button>
          <Badge variant={tienda.estado === "activa" ? "secondary" : "outline"}>
            {ETIQUETA_ESTADO[tienda.estado]}
          </Badge>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-text-muted">
          <span>
            {tienda.fecha_lanzamiento
              ? `Lanzada el ${formatearFecha(tienda.fecha_lanzamiento)}`
              : "Sin fecha de lanzamiento"}
          </span>
          {tienda.url_shopify ? (
            <a
              href={/^https?:/i.test(tienda.url_shopify) ? tienda.url_shopify : `https://${tienda.url_shopify}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-text-primary"
            >
              {tienda.url_shopify.replace(/^https?:\/\//i, "")}
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : null}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
        <div>
          <dt className="text-text-muted">Facturación acumulada</dt>
          <dd className="cifra font-medium text-text-primary">{formatearEuros(metricas.ingresos)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Beneficio acumulado</dt>
          <dd
            className={cn(
              "cifra font-medium",
              metricas.beneficio < 0 ? "text-danger" : "text-success",
            )}
          >
            {formatearEuros(metricas.beneficio)}
          </dd>
        </div>
      </dl>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 self-end sm:self-center"
            aria-label={`Acciones de ${tienda.nombre}`}
            disabled={pendiente}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={alEditar} className="min-h-10 gap-2">
            <Pencil aria-hidden="true" className="size-4" /> Editar
          </DropdownMenuItem>
          {tienda.estado === "activa" ? (
            <DropdownMenuItem onSelect={() => estado("pausada")} className="min-h-10 gap-2">
              <Pause aria-hidden="true" className="size-4" /> Pausar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => estado("activa")} className="min-h-10 gap-2">
              <Play aria-hidden="true" className="size-4" /> Reactivar
            </DropdownMenuItem>
          )}
          {tienda.estado !== "archivada" ? (
            <DropdownMenuItem onSelect={() => estado("archivada")} className="min-h-10 gap-2">
              <Archive aria-hidden="true" className="size-4" /> Archivar
            </DropdownMenuItem>
          ) : null}
          {vacia && esAutor ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={borrar}
                className="min-h-10 gap-2 text-danger focus:text-danger"
              >
                <Trash2 aria-hidden="true" className="size-4" /> Borrar (está vacía)
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
