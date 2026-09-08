"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";

import { DialogoReembolso } from "@/components/liquidacion/dialogo-reembolso";
import { DialogoProrrata } from "@/components/liquidacion/dialogo-prorrata";
import { EstadoVacio } from "@/components/estado-vacio";
import { cn } from "@/lib/utils";
import { formatearEuros, formatearFecha } from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import type { AnticipoPendiente, ResumenSocio } from "@/lib/tipos-liquidacion";

/**
 * Anticipos pendientes con selección múltiple.
 *
 * Orden fijo por fecha ascendente: lo más antiguo primero, que es lo que toca
 * devolver antes. No se ofrece cambiarlo a propósito.
 */
export function TablaAnticipos({
  anticipos,
  socios,
}: {
  anticipos: AnticipoPendiente[];
  socios: ResumenSocio[];
}) {
  const router = useRouter();
  const [filtroSocio, setFiltroSocio] = useState("todos");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const visibles = useMemo(
    () =>
      filtroSocio === "todos"
        ? anticipos
        : anticipos.filter((a) => a.socio_id === filtroSocio),
    [anticipos, filtroSocio],
  );

  const seleccionados = useMemo(
    () => anticipos.filter((a) => seleccion.has(a.id)),
    [anticipos, seleccion],
  );

  const totalSeleccionado = redondear2(
    seleccionados.reduce((s, a) => s + a.pendiente_eur, 0),
  );

  const todasMarcadas =
    visibles.length > 0 && visibles.every((a) => seleccion.has(a.id));

  function alternar(id: string) {
    setSeleccion((anterior) => {
      const siguiente = new Set(anterior);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function alternarTodas() {
    setSeleccion((anterior) => {
      const siguiente = new Set(anterior);
      if (todasMarcadas) visibles.forEach((a) => siguiente.delete(a.id));
      else visibles.forEach((a) => siguiente.add(a.id));
      return siguiente;
    });
  }

  function refrescar() {
    setSeleccion(new Set());
    router.refresh();
  }

  if (anticipos.length === 0) {
    return (
      <EstadoVacio
        icono={HandCoins}
        titulo="No hay anticipos pendientes"
        descripcion="Todo lo que los socios pusieron de su bolsillo está devuelto."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filtro-socio" className="sr-only">
          Filtrar por socio
        </label>
        <select
          id="filtro-socio"
          value={filtroSocio}
          onChange={(evento) => setFiltroSocio(evento.target.value)}
          className="h-11 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary outline-none focus-visible:border-brand"
        >
          <option value="todos">Todos los socios</option>
          {socios.map((socio) => (
            <option key={socio.socio_id} value={socio.socio_id}>
              {socio.nombre}
            </option>
          ))}
        </select>

        <DialogoProrrata socios={socios} alTerminar={refrescar} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">
            Anticipos pendientes de reembolso, del más antiguo al más reciente
          </caption>
          <thead>
            <tr className="border-b border-border bg-base text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
              <th scope="col" className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={alternarTodas}
                  aria-label="Seleccionar todos los anticipos visibles"
                  className="size-4 accent-[var(--accent)]"
                />
              </th>
              <th scope="col" className="px-3 py-2.5">Fecha</th>
              <th scope="col" className="px-3 py-2.5">Concepto</th>
              <th scope="col" className="px-3 py-2.5">Categoría</th>
              <th scope="col" className="px-3 py-2.5">Socio</th>
              <th scope="col" className="px-3 py-2.5 text-right">Importe</th>
              <th scope="col" className="px-3 py-2.5 text-right">Reembolsado</th>
              <th scope="col" className="px-3 py-2.5 text-right">Pendiente</th>
            </tr>
          </thead>

          <tbody>
            {visibles.map((anticipo) => {
              const marcada = seleccion.has(anticipo.id);
              const parcial = anticipo.reembolsado_eur > 0;

              return (
                <tr
                  key={anticipo.id}
                  className={cn(
                    "border-b border-border last:border-b-0 transition-colors",
                    marcada ? "bg-brand-soft" : "hover:bg-base",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(anticipo.id)}
                      aria-label={`Seleccionar ${anticipo.concepto}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="cifra px-3 py-2.5 whitespace-nowrap text-text-secondary">
                    {formatearFecha(anticipo.fecha)}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-text-primary">
                    {anticipo.concepto}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex max-w-full truncate rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                      {anticipo.categoria}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: anticipo.socio_color ?? "#6E6E73" }}
                        className="size-2 shrink-0 rounded-full"
                      />
                      {anticipo.socio}
                    </span>
                  </td>
                  <td className="cifra px-3 py-2.5 text-right text-text-secondary">
                    {formatearEuros(anticipo.total_eur)}
                  </td>
                  <td
                    className={cn(
                      "cifra px-3 py-2.5 text-right",
                      parcial ? "text-success" : "text-text-muted",
                    )}
                  >
                    {formatearEuros(anticipo.reembolsado_eur)}
                  </td>
                  <td className="cifra px-3 py-2.5 text-right font-medium text-warning">
                    {formatearEuros(anticipo.pendiente_eur)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Barra flotante con la acción en lote. Deja hueco a la navegación
          inferior del móvil para no taparla. */}
      {seleccionados.length > 0 ? (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6 md:left-sidebar">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 shadow-lg">
            <p className="cifra min-w-0 flex-1 text-sm text-text-primary">
              <span className="font-semibold">{seleccionados.length}</span>{" "}
              anticipo{seleccionados.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold">
                {formatearEuros(totalSeleccionado)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Quitar selección
            </button>
            <button
              type="button"
              onClick={() => setDialogoAbierto(true)}
              className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Registrar reembolso
            </button>
          </div>
        </div>
      ) : null}

      <DialogoReembolso
        abierto={dialogoAbierto}
        alCambiar={setDialogoAbierto}
        seleccionados={seleccionados}
        alTerminar={refrescar}
      />
    </div>
  );
}
