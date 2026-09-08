"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { registrarReembolso } from "@/app/acciones/liquidacion";
import { formatearEuros } from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import { METODOS_REEMBOLSO, type AnticipoPendiente } from "@/lib/tipos-liquidacion";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/**
 * Reparte un importe entre los anticipos seleccionados, proporcionalmente y
 * sin perder ni inventar un céntimo: el último absorbe la diferencia del
 * redondeo. Solo sirve para ENSEÑAR el desglose antes de confirmar; los
 * importes definitivos los revalida la base de datos.
 */
function repartir(
  seleccionados: AnticipoPendiente[],
  importe: number,
): { anticipo: AnticipoPendiente; asignado: number }[] {
  const total = redondear2(
    seleccionados.reduce((suma, a) => suma + a.pendiente_eur, 0),
  );

  if (total <= 0 || importe <= 0) {
    return seleccionados.map((anticipo) => ({ anticipo, asignado: 0 }));
  }

  // Cubre todo: cada uno recibe su pendiente íntegro, nadie de más.
  if (importe >= total) {
    return seleccionados.map((anticipo) => ({
      anticipo,
      asignado: anticipo.pendiente_eur,
    }));
  }

  const filas = seleccionados.map((anticipo) => ({
    anticipo,
    asignado: redondear2((anticipo.pendiente_eur * importe) / total),
  }));

  const asignado = redondear2(filas.reduce((s, f) => s + f.asignado, 0));
  const diferencia = redondear2(importe - asignado);

  if (diferencia !== 0 && filas.length > 0) {
    const ultima = filas[filas.length - 1]!;
    ultima.asignado = redondear2(ultima.asignado + diferencia);
  }

  return filas;
}

export function DialogoReembolso({
  abierto,
  alCambiar,
  seleccionados,
  alTerminar,
}: {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  seleccionados: AnticipoPendiente[];
  alTerminar: () => void;
}) {
  const sociosDistintos = useMemo(
    () => new Set(seleccionados.map((a) => a.socio_id)),
    [seleccionados],
  );
  const mezclados = sociosDistintos.size > 1;

  const totalSeleccionado = useMemo(
    () => redondear2(seleccionados.reduce((s, a) => s + a.pendiente_eur, 0)),
    [seleccionados],
  );

  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [importe, setImporte] = useState<number | null>(totalSeleccionado);
  const [metodo, setMetodo] = useState<string>("transferencia");
  const [notas, setNotas] = useState("");
  const [guardando, iniciarGuardado] = useTransition();

  // Al abrirse con otra selección, el importe vuelve a proponerse.
  const [ultimoTotal, setUltimoTotal] = useState(totalSeleccionado);
  if (ultimoTotal !== totalSeleccionado) {
    setUltimoTotal(totalSeleccionado);
    setImporte(totalSeleccionado);
  }

  const desglose = useMemo(
    () => repartir(seleccionados, importe ?? 0),
    [seleccionados, importe],
  );

  const esParcial = (importe ?? 0) < totalSeleccionado;
  const socio = seleccionados[0];

  function guardar() {
    if (mezclados || !socio) return;
    if (!importe || importe <= 0) {
      toast.error("Escribe el importe del reembolso.");
      return;
    }

    const lineas = desglose
      .filter((fila) => fila.asignado > 0)
      .map((fila) => ({
        movimiento_id: fila.anticipo.id,
        importe_eur: fila.asignado,
      }));

    if (lineas.length === 0) {
      toast.error("El importe no alcanza para cubrir ningún anticipo.");
      return;
    }

    iniciarGuardado(async () => {
      const resultado = await registrarReembolso({
        socio_id: socio.socio_id,
        fecha,
        importe,
        metodo,
        notas: notas.trim() || null,
        lineas,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success("Reembolso registrado.");
      alCambiar(false);
      alTerminar();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-primary">
            Registrar reembolso
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Devolución a un socio del dinero que puso de su bolsillo.
          </DialogDescription>
        </DialogHeader>

        {mezclados ? (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-warning">
                Hay anticipos de dos socios distintos.{" "}
              </span>
              Un reembolso va a una sola persona. Separa la selección por socio y
              registra un reembolso para cada uno.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-base p-3">
              <p className="text-xs text-text-secondary">Se le reembolsa a</p>
              <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: socio?.socio_color ?? "#6E6E73" }}
                  className="size-2.5 rounded-full"
                />
                {socio?.socio}
              </p>
              <p className="cifra mt-1 text-xs text-text-secondary">
                {seleccionados.length} anticipo
                {seleccionados.length === 1 ? "" : "s"} ·{" "}
                {formatearEuros(totalSeleccionado)} pendientes
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="reem-fecha" className="text-sm font-medium text-text-primary">
                  Fecha
                </label>
                <SelectorFecha id="reem-fecha" valor={fecha} alCambiar={setFecha} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reem-importe" className="text-sm font-medium text-text-primary">
                  Importe total
                </label>
                <CampoImporte
                  id="reem-importe"
                  valor={importe}
                  alCambiar={setImporte}
                  sufijo="€"
                />
              </div>
            </div>

            {esParcial ? (
              <div className="rounded-lg border border-border bg-base p-3">
                <p className="text-xs font-medium text-text-primary">
                  Reembolso parcial: así se reparte entre los anticipos
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {desglose.map((fila) => (
                    <li
                      key={fila.anticipo.id}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-text-secondary">
                        {fila.anticipo.concepto}
                      </span>
                      <span className="cifra shrink-0 text-text-primary">
                        {formatearEuros(fila.asignado)}
                      </span>
                      <span className="cifra w-24 shrink-0 text-right text-text-muted">
                        de {formatearEuros(fila.anticipo.pendiente_eur)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-border pt-2 text-xs text-text-muted">
                  Lo que no se cubra sigue figurando como pendiente.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reem-metodo" className="text-sm font-medium text-text-primary">
                Método
              </label>
              <select
                id="reem-metodo"
                value={metodo}
                onChange={(evento) => setMetodo(evento.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary outline-none focus-visible:border-brand"
              >
                {METODOS_REEMBOLSO.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reem-notas" className="text-sm font-medium text-text-primary">
                Notas <span className="text-text-muted">(opcional)</span>
              </label>
              <input
                id="reem-notas"
                value={notas}
                onChange={(evento) => setNotas(evento.target.value)}
                placeholder="Referencia de la transferencia…"
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => alCambiar(false)}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={mezclados || guardando}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
          >
            {guardando ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Registrar reembolso
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
