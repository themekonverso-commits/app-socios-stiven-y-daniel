"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActaCierre } from "@/components/liquidacion/acta-cierre";
import { Aprobaciones } from "@/components/liquidacion/aprobaciones";
import { eliminarCierre } from "@/app/acciones/liquidacion";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import type { Cierre, ResumenSocio } from "@/lib/tipos-liquidacion";

const ESTILO_ESTADO: Record<string, string> = {
  borrador: "bg-warning/12 text-warning",
  aprobado: "bg-success/12 text-success",
  anulado: "bg-surface-2 text-text-muted",
};

export function TarjetaCierre({
  cierre,
  socios,
  usuarioId,
}: {
  cierre: Cierre;
  socios: ResumenSocio[];
  usuarioId: string | null;
}) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, iniciarBorrado] = useTransition();

  const aprobado = cierre.estado === "aprobado";

  function borrar() {
    setConfirmar(false);
    iniciarBorrado(async () => {
      const resultado = await eliminarCierre(cierre.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Borrador eliminado.");
      router.refresh();
    });
  }

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            {cierre.etiqueta}
            {aprobado ? (
              <Lock aria-hidden="true" className="size-3.5 text-success" />
            ) : null}
          </h2>
          <p className="cifra mt-0.5 text-xs text-text-secondary">
            {formatearFecha(cierre.periodo_inicio)} –{" "}
            {formatearFecha(cierre.periodo_fin)}
          </p>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-1 text-xs font-medium capitalize",
            ESTILO_ESTADO[cierre.estado] ?? "bg-surface-2 text-text-muted",
          )}
        >
          {cierre.estado}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { etiqueta: "Resultado", valor: cierre.resultado_eur, color: true },
          { etiqueta: "Base distribuible", valor: cierre.base_distribuible_eur },
          { etiqueta: "Reinversión", valor: cierre.importe_reinversion },
          { etiqueta: "Repartido", valor: cierre.importe_reparto_total },
        ].map((celda) => (
          <div key={celda.etiqueta} className="rounded-lg border border-border bg-base p-3">
            <dt className="text-xs text-text-secondary">{celda.etiqueta}</dt>
            <dd
              className={cn(
                "cifra mt-1 text-sm font-semibold",
                celda.color
                  ? celda.valor >= 0
                    ? "text-success"
                    : "text-danger"
                  : "text-text-primary",
              )}
            >
              {formatearEuros(celda.valor)}
            </dd>
          </div>
        ))}
      </dl>

      {cierre.notas ? (
        <p className="rounded-lg border border-border bg-base p-3 text-sm whitespace-pre-wrap text-text-secondary">
          {cierre.notas}
        </p>
      ) : null}

      <Aprobaciones cierre={cierre} socios={socios} usuarioId={usuarioId} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {aprobado ? <ActaCierre cierre={cierre} socios={socios} /> : null}

        {!aprobado ? (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={borrando}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Eliminar borrador
          </button>
        ) : (
          <p className="text-xs text-text-muted">
            Aprobado por ambos socios: ni se edita ni se borra.
          </p>
        )}
      </div>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar el borrador «{cierre.etiqueta}»?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Solo se puede borrar mientras esté en borrador. Las firmas que ya
              haya se pierden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={borrar}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
