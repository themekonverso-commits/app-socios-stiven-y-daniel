"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

import { MenuCuenta } from "@/components/cuentas/menu-cuenta";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha, mayusculaInicial } from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import type { CuentaConCoste } from "@/lib/tipos-cuentas";

const ESTILO_ESTADO: Record<string, string> = {
  activa: "bg-success/12 text-success",
  pausada: "bg-warning/12 text-warning",
  cancelada: "bg-surface-2 text-text-muted",
};

/** Borde izquierdo de aviso: rojo si venció, ámbar si le queda poco. */
function claseAviso(cuenta: CuentaConCoste): string {
  if (cuenta.vencida) return "border-l-[3px] border-l-danger";
  if (cuenta.renueva_pronto) return "border-l-[3px] border-l-warning";
  return "border-l-[3px] border-l-transparent";
}

function EnlaceExterno({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Abrir en una pestaña nueva"
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-brand"
    >
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}

export function ListaCuentas({
  cuentas,
  vista,
}: {
  cuentas: CuentaConCoste[];
  vista: "tarjetas" | "tabla";
}) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, CuentaConCoste[]>();
    for (const cuenta of cuentas) {
      const tipo = cuenta.tipo ?? "otro";
      mapa.set(tipo, [...(mapa.get(tipo) ?? []), cuenta]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [cuentas]);

  const totales = useMemo(
    () => ({
      mensual: redondear2(
        cuentas.reduce((s, c) => s + Number(c.coste_mensual_eur ?? 0), 0),
      ),
    }),
    [cuentas],
  );

  if (vista === "tabla") {
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <caption className="sr-only">Inventario de cuentas y activos</caption>
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="px-3 py-2.5">Nombre</th>
              <th scope="col" className="px-3 py-2.5">Tipo</th>
              <th scope="col" className="px-3 py-2.5">Correo</th>
              <th scope="col" className="px-3 py-2.5">Titular</th>
              <th scope="col" className="px-3 py-2.5 text-right">Coste</th>
              <th scope="col" className="px-3 py-2.5">Periodicidad</th>
              <th scope="col" className="px-3 py-2.5">Renovación</th>
              <th scope="col" className="px-3 py-2.5">Estado</th>
              <th scope="col" className="px-2 py-2.5">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {cuentas.map((cuenta) => (
              <tr
                key={String(cuenta.id)}
                className={cn(
                  "border-b border-border last:border-b-0 hover:bg-surface",
                  claseAviso(cuenta),
                )}
              >
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-text-primary">
                      {cuenta.nombre}
                    </span>
                    {cuenta.url ? <EnlaceExterno url={String(cuenta.url)} /> : null}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                    {cuenta.tipo}
                  </span>
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-text-muted">
                  {cuenta.email_asociado ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  {cuenta.titular_nombre ? (
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: cuenta.titular_color ?? "#6E6E73" }}
                        className="size-2 shrink-0 rounded-full"
                      />
                      {cuenta.titular_nombre}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                  {cuenta.coste === null
                    ? "—"
                    : `${formatearEuros(Number(cuenta.coste_eur ?? 0))}`}
                </td>
                <td className="px-3 py-2.5 text-text-secondary">
                  {cuenta.periodicidad ? mayusculaInicial(cuenta.periodicidad) : "—"}
                </td>
                <td className="cifra px-3 py-2.5 whitespace-nowrap">
                  {cuenta.fecha_renovacion ? (
                    <span
                      className={cn(
                        cuenta.vencida
                          ? "text-danger"
                          : cuenta.renueva_pronto
                            ? "text-warning"
                            : "text-text-secondary",
                      )}
                    >
                      {formatearFecha(String(cuenta.fecha_renovacion))}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                      ESTILO_ESTADO[String(cuenta.estado)] ?? "bg-surface-2 text-text-muted",
                    )}
                  >
                    {mayusculaInicial(String(cuenta.estado))}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <MenuCuenta cuenta={cuenta} />
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border bg-surface font-semibold">
              <td className="px-3 py-3 text-text-primary" colSpan={4}>
                Total · {cuentas.length} cuenta{cuentas.length === 1 ? "" : "s"}
              </td>
              <td className="cifra px-3 py-3 text-right text-text-primary">
                {formatearEuros(totales.mensual)}
              </td>
              <td className="px-3 py-3 text-xs font-normal text-text-muted" colSpan={4}>
                normalizado a mensual
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // VISTA TARJETAS, agrupadas por tipo.
  return (
    <div className="flex flex-col gap-6">
      {grupos.map(([tipo, delGrupo]) => {
        const mensualGrupo = redondear2(
          delGrupo.reduce((s, c) => s + Number(c.coste_mensual_eur ?? 0), 0),
        );

        return (
          <section key={tipo} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 className="text-sm font-semibold text-text-primary">
                {mayusculaInicial(tipo)}
                <span className="cifra ml-2 text-xs font-normal text-text-muted">
                  {delGrupo.length}
                </span>
              </h2>
              <span className="cifra text-xs text-text-secondary">
                {formatearEuros(mensualGrupo)}/mes
              </span>
            </div>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {delGrupo.map((cuenta) => (
                <li
                  key={String(cuenta.id)}
                  className={cn(
                    "flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2",
                    claseAviso(cuenta),
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-text-primary">
                        {cuenta.nombre}
                      </h3>
                      {cuenta.email_asociado ? (
                        <p className="truncate text-xs text-text-muted">
                          {cuenta.email_asociado}
                        </p>
                      ) : null}
                    </div>
                    {cuenta.url ? <EnlaceExterno url={String(cuenta.url)} /> : null}
                    <MenuCuenta cuenta={cuenta} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                      {cuenta.tipo}
                    </span>
                    {cuenta.estado !== "activa" ? (
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium",
                          ESTILO_ESTADO[String(cuenta.estado)],
                        )}
                      >
                        {mayusculaInicial(String(cuenta.estado))}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="cifra text-lg font-semibold text-text-primary">
                      {cuenta.coste === null
                        ? "Gratuito"
                        : formatearEuros(Number(cuenta.coste_eur ?? 0))}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {mayusculaInicial(String(cuenta.periodicidad ?? ""))}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
                    {cuenta.titular_nombre ? (
                      <span className="flex items-center gap-1.5 text-text-secondary">
                        <span
                          aria-hidden="true"
                          style={{ backgroundColor: cuenta.titular_color ?? "#6E6E73" }}
                          className="size-2 shrink-0 rounded-full"
                        />
                        {cuenta.titular_nombre}
                      </span>
                    ) : (
                      <span className="text-text-muted">Sin titular</span>
                    )}

                    {cuenta.fecha_renovacion ? (
                      <span
                        className={cn(
                          "cifra ml-auto",
                          cuenta.vencida
                            ? "text-danger"
                            : cuenta.renueva_pronto
                              ? "text-warning"
                              : "text-text-muted",
                        )}
                      >
                        {cuenta.vencida ? "Venció el " : "Renueva el "}
                        {formatearFecha(String(cuenta.fecha_renovacion))}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
