"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { crearCierre, previsualizarCierre } from "@/app/acciones/liquidacion";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import { ultimosTrimestres, type Trimestre } from "@/lib/trimestres";
import type { ResumenSocio } from "@/lib/tipos-liquidacion";

type Preview = {
  ingresos_eur: number;
  gastos_eur: number;
  resultado_eur: number;
  perdidas_previas_eur: number;
  anticipos_pendientes_eur: number;
  base_distribuible_eur: number;
  pct_reinversion: number;
  pct_reparto: number;
  importe_reinversion: number;
  importe_reparto_total: number;
  reparto_por_socio: Record<string, number>;
  en_fase_inicial: boolean;
  puede_repartir: boolean;
  motivo_bloqueo: string | null;
};

const PASOS = ["Periodo", "Revisión", "Decisión"] as const;

/**
 * Asistente de cierre trimestral en 3 pasos.
 *
 * Ninguna cifra se calcula aquí: cada cambio de porcentaje vuelve a preguntar a
 * fn_previsualizar_cierre, que es la MISMA función que usará el alta. Así lo
 * que se ve en la vista previa es exactamente lo que se guarda.
 */
export function AsistenteCierre({
  socios,
  propuesto,
}: {
  socios: ResumenSocio[];
  propuesto: Trimestre;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [trimestre, setTrimestre] = useState<Trimestre>(propuesto);
  const [pctReinversion, setPctReinversion] = useState(50);
  const [notas, setNotas] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cargando, iniciarCarga] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  const trimestres = ultimosTrimestres(8);

  // La vista previa se recalcula en el servidor con cada cambio.
  useEffect(() => {
    if (!abierto || paso === 0) return;

    iniciarCarga(async () => {
      const resultado = await previsualizarCierre(
        trimestre.inicio,
        trimestre.fin,
        pctReinversion,
      );
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setPreview(resultado.datos as unknown as Preview);
    });
  }, [abierto, paso, trimestre.inicio, trimestre.fin, pctReinversion]);

  function guardar() {
    iniciarGuardado(async () => {
      const resultado = await crearCierre({
        etiqueta: trimestre.etiqueta,
        inicio: trimestre.inicio,
        fin: trimestre.fin,
        pct_reinversion: pctReinversion,
        notas: notas.trim() || null,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success("Cierre creado en borrador. Falta que lo aprueben los dos socios.");
      setAbierto(false);
      setPaso(0);
      setNotas("");
      router.refresh();
    });
  }

  const nombreDe = (id: string) =>
    socios.find((s) => s.socio_id === id)?.nombre ?? "Socio";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTrimestre(propuesto);
          setPctReinversion(50);
          setPaso(0);
          setPreview(null);
          setAbierto(true);
        }}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        Nuevo cierre
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-surface sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Cierre trimestral
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Acta de la reunión: cifras del periodo y decisión de reparto.
            </DialogDescription>
          </DialogHeader>

          {/* Indicador de progreso */}
          <ol className="flex items-center gap-2">
            {PASOS.map((etiqueta, indice) => (
              <li key={etiqueta} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "cifra flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    indice < paso
                      ? "bg-success text-white"
                      : indice === paso
                        ? "bg-brand text-white"
                        : "bg-surface-2 text-text-muted",
                  )}
                >
                  {indice < paso ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    indice + 1
                  )}
                </span>
                <span
                  className={cn(
                    "truncate text-xs",
                    indice === paso ? "font-medium text-text-primary" : "text-text-muted",
                  )}
                >
                  {etiqueta}
                </span>
                {indice < PASOS.length - 1 ? (
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                ) : null}
              </li>
            ))}
          </ol>

          {/* PASO 1 — Periodo */}
          {paso === 0 ? (
            <div className="flex flex-col gap-3">
              <label htmlFor="cierre-trimestre" className="text-sm font-medium text-text-primary">
                Trimestre a cerrar
              </label>
              <select
                id="cierre-trimestre"
                value={`${trimestre.inicio}|${trimestre.fin}`}
                onChange={(evento) => {
                  const [inicio, fin] = evento.target.value.split("|");
                  const elegido = trimestres.find(
                    (t) => t.inicio === inicio && t.fin === fin,
                  );
                  if (elegido) setTrimestre(elegido);
                }}
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary outline-none focus-visible:border-brand"
              >
                {trimestres.map((t) => (
                  <option key={`${t.inicio}|${t.fin}`} value={`${t.inicio}|${t.fin}`}>
                    {t.etiqueta}
                    {t.terminado ? "" : " (aún en curso)"}
                  </option>
                ))}
              </select>

              <p className="cifra rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-secondary">
                Del {formatearFecha(trimestre.inicio)} al{" "}
                {formatearFecha(trimestre.fin)}
              </p>

              {!trimestre.terminado ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    Este trimestre todavía no ha terminado. Puedes cerrarlo, pero
                    las cifras cambiarán con los movimientos que falten por
                    registrar.
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {/* PASO 2 — Revisión */}
          {paso === 1 ? (
            <div className="flex flex-col gap-3">
              {cargando || !preview ? (
                <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  Calculando las cifras del periodo…
                </p>
              ) : (
                <>
                  <dl className="overflow-hidden rounded-lg border border-border">
                    {[
                      { etiqueta: "Ingresos", valor: preview.ingresos_eur },
                      { etiqueta: "Gastos", valor: preview.gastos_eur },
                      { etiqueta: "Resultado", valor: preview.resultado_eur, fuerte: true },
                      { etiqueta: "Pérdidas previas", valor: preview.perdidas_previas_eur },
                      { etiqueta: "Anticipos pendientes", valor: preview.anticipos_pendientes_eur },
                      { etiqueta: "Base distribuible", valor: preview.base_distribuible_eur, fuerte: true },
                    ].map((fila) => (
                      <div
                        key={fila.etiqueta}
                        className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                      >
                        <dt className="text-sm text-text-secondary">{fila.etiqueta}</dt>
                        <dd
                          className={cn(
                            "cifra text-sm",
                            fila.fuerte
                              ? "font-semibold text-text-primary"
                              : "text-text-secondary",
                          )}
                        >
                          {formatearEuros(fila.valor)}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {preview.anticipos_pendientes_eur > 0 ? (
                    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        <span className="font-semibold text-warning">
                          Hay {formatearEuros(preview.anticipos_pendientes_eur)} de
                          anticipos sin devolver.{" "}
                        </span>
                        El contrato (Regla 4) impide repartir beneficio hasta
                        saldarlos, así que el cierre irá al 100 % a reinversión.
                        Puedes registrarlos antes en la sección de anticipos.
                      </span>
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* PASO 3 — Decisión */}
          {paso === 2 ? (
            <div className="flex flex-col gap-4">
              {!preview ? null : preview.puede_repartir ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="pct-reinversion" className="text-sm font-medium text-text-primary">
                      Reparto de la base distribuible
                    </label>
                    <input
                      id="pct-reinversion"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={pctReinversion}
                      onChange={(evento) => setPctReinversion(Number(evento.target.value))}
                      className="h-11 w-full accent-[var(--accent)]"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="num-reinversion" className="text-xs text-text-secondary">
                          Reinversión
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="num-reinversion"
                            type="number"
                            min={0}
                            max={100}
                            value={pctReinversion}
                            onChange={(evento) =>
                              setPctReinversion(
                                Math.max(0, Math.min(100, Number(evento.target.value))),
                              )
                            }
                            className="cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand"
                          />
                          <span className="text-sm text-text-muted">%</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="num-reparto" className="text-xs text-text-secondary">
                          Reparto
                        </label>
                        <div className="flex items-center gap-2">
                          {/* Los dos siempre suman 100: al mover uno se ajusta el otro. */}
                          <input
                            id="num-reparto"
                            type="number"
                            min={0}
                            max={100}
                            value={100 - pctReinversion}
                            onChange={(evento) =>
                              setPctReinversion(
                                100 - Math.max(0, Math.min(100, Number(evento.target.value))),
                              )
                            }
                            className="cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand"
                          />
                          <span className="text-sm text-text-muted">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-base p-3">
                    <p className="text-sm text-text-primary">
                      Se reinvierten{" "}
                      <span className="cifra font-semibold">
                        {formatearEuros(preview.importe_reinversion)}
                      </span>
                      .{" "}
                      {preview.importe_reparto_total > 0 ? (
                        <>
                          Cada socio recibe{" "}
                          <span className="cifra font-semibold text-brand">
                            {formatearEuros(
                              Object.values(preview.reparto_por_socio)[0] ?? 0,
                            )}
                          </span>
                          .
                        </>
                      ) : (
                        <>No hay reparto entre socios.</>
                      )}
                    </p>

                    {Object.keys(preview.reparto_por_socio).length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                        {Object.entries(preview.reparto_por_socio).map(([id, importe]) => (
                          <li key={id} className="flex justify-between text-xs">
                            <span className="text-text-secondary">{nombreDe(id)}</span>
                            <span className="cifra text-text-primary">
                              {formatearEuros(importe)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    <span className="font-semibold text-warning">
                      Sin reparto en este cierre.{" "}
                    </span>
                    {preview.motivo_bloqueo} Todo va a reinversión, tal y como
                    manda el contrato.
                  </span>
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="cierre-notas" className="text-sm font-medium text-text-primary">
                  Notas del acta <span className="text-text-muted">(opcional)</span>
                </label>
                <textarea
                  id="cierre-notas"
                  rows={3}
                  value={notas}
                  onChange={(evento) => setNotas(evento.target.value)}
                  placeholder="Acuerdos de la reunión trimestral…"
                  className="min-h-20 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-base text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
                />
              </div>
            </div>
          ) : null}

          {/* Navegación */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => (paso === 0 ? setAbierto(false) : setPaso(paso - 1))}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {paso === 0 ? "Cancelar" : "Atrás"}
            </button>

            {paso < 2 ? (
              <button
                type="button"
                onClick={() => setPaso(paso + 1)}
                className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Continuar
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !preview}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
              >
                {guardando ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                Crear borrador
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
