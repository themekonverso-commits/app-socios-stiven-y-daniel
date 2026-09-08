"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Lock } from "lucide-react";
import { toast } from "sonner";

import { aprobarCierre, retirarAprobacion } from "@/app/acciones/liquidacion";
import { cn } from "@/lib/utils";
import { formatearFechaLarga } from "@/lib/formato";
import type { Cierre, ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * Doble aprobación del acta.
 *
 * Cada socio marca SOLO su casilla. Aquí se deshabilita la del otro por
 * cortesía visual, pero la cerradura de verdad está en fn_aprobar_cierre: esa
 * función no recibe ningún parámetro con el id del firmante, lo toma de
 * auth.uid(). Aunque alguien manipulase la petición, firmaría por sí mismo.
 */
export function Aprobaciones({
  cierre,
  socios,
  usuarioId,
}: {
  cierre: Cierre;
  socios: ResumenSocio[];
  usuarioId: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const aprobado = cierre.estado === "aprobado";

  function firmar() {
    iniciarTransicion(async () => {
      const resultado = await aprobarCierre(cierre.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        resultado.datos?.estado === "aprobado"
          ? "Cierre aprobado por ambos socios. Queda bloqueado."
          : "Tu aprobación queda registrada. Falta la del otro socio.",
      );
      router.refresh();
    });
  }

  function retirar() {
    iniciarTransicion(async () => {
      const resultado = await retirarAprobacion(cierre.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Aprobación retirada.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Aprobaciones</h3>
        {aprobado ? (
          <span className="flex items-center gap-1 rounded-md bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
            <Lock aria-hidden="true" className="size-3" />
            Bloqueado
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {socios.map((socio) => {
          const firma = cierre.aprobaciones?.[socio.socio_id];
          const esMio = socio.socio_id === usuarioId;

          return (
            <li
              key={socio.socio_id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5",
                firma ? "border-success/30 bg-success/10" : "border-border bg-base",
              )}
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: socio.color ?? "#6E6E73" }}
                className="size-2.5 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {socio.nombre}
                {esMio ? (
                  <span className="ml-1 text-xs text-text-muted">(tú)</span>
                ) : null}
              </span>

              {firma ? (
                <span className="flex items-center gap-1.5 text-xs text-success">
                  <Check aria-hidden="true" className="size-3.5" />
                  <span className="cifra">
                    Aprobado el {formatearFechaLarga(firma)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-text-muted">Sin firmar</span>
              )}

              {!aprobado && esMio ? (
                firma ? (
                  <button
                    type="button"
                    onClick={retirar}
                    disabled={pendiente}
                    className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                  >
                    Retirar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={firmar}
                    disabled={pendiente}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                  >
                    {pendiente ? (
                      <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : null}
                    Aprobar
                  </button>
                )
              ) : null}

              {!aprobado && !esMio ? (
                <span
                  title="Solo ese socio puede firmar por sí mismo"
                  className="shrink-0 text-xs text-text-muted"
                >
                  Le toca a {socio.nombre}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!aprobado ? (
        <p className="text-xs text-text-muted">
          Cada socio firma únicamente su casilla. Cuando estén las dos, el acta
          se cierra y deja de poder modificarse.
        </p>
      ) : null}
    </div>
  );
}
