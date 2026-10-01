"use client";

import { useEffect, useState, useTransition } from "react";
import { format, subDays } from "date-fns";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { consultarVentasRegistradas, crearCobro } from "@/app/acciones/cobros";
import { calcularNeto, conciliar, mensajeConciliacion } from "@/lib/cobros";
import { formatearEuros } from "@/lib/formato";
import { cn } from "@/lib/utils";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

const CLASE_INPUT =
  "h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand";

function Campo({
  id,
  etiqueta,
  ayuda,
  children,
}: {
  id?: string;
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-text-secondary">
        {etiqueta}
      </label>
      {children}
      {ayuda ? <p className="text-xs text-text-muted">{ayuda}</p> : null}
    </div>
  );
}

/**
 * Alta de un payout con los mismos campos que el desglose de Shopify.
 *
 * El neto se calcula en vivo y es el que se guarda: no se escribe a mano. Y en
 * cuanto hay bruto y periodo, se enseña ya cuánto hay registrado en /diario
 * esos días, para ver el descuadre antes de guardar y no después.
 */
export function FormularioCobro() {
  const [fechaCobro, setFechaCobro] = useState(() => iso(new Date()));
  const [desde, setDesde] = useState(() => iso(subDays(new Date(), 3)));
  const [hasta, setHasta] = useState(() => iso(subDays(new Date(), 1)));
  const [plataforma, setPlataforma] = useState("Shopify Payments");
  const [bruto, setBruto] = useState<number | null>(null);
  const [comisiones, setComisiones] = useState<number | null>(null);
  const [devoluciones, setDevoluciones] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [ventas, setVentas] = useState<number | null>(null);
  const [guardando, iniciarGuardado] = useTransition();

  const neto = calcularNeto({
    importe_bruto: bruto ?? 0,
    comisiones: comisiones ?? 0,
    devoluciones: devoluciones ?? 0,
    otros_ajustes: ajustes ?? 0,
  });

  const periodoValido = desde <= hasta;

  // Ventas de /diario en el periodo, con un pequeño debounce.
  useEffect(() => {
    if (!periodoValido) {
      setVentas(null);
      return;
    }
    let vigente = true;
    const temporizador = window.setTimeout(async () => {
      const resultado = await consultarVentasRegistradas(desde, hasta);
      if (vigente) setVentas(resultado.ok ? (resultado.datos?.ventas ?? 0) : null);
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [desde, hasta, periodoValido]);

  const previa =
    bruto !== null && bruto > 0 && ventas !== null ? conciliar(bruto, ventas) : null;

  function limpiar() {
    setBruto(null);
    setComisiones(null);
    setDevoluciones(null);
    setAjustes(null);
    setReferencia("");
    setNotas("");
  }

  function enviar() {
    if (bruto === null || bruto <= 0) {
      toast.error("Escribe el importe bruto de las ventas del payout.");
      return;
    }
    if (!periodoValido) {
      toast.error("El periodo termina antes de empezar.");
      return;
    }

    iniciarGuardado(async () => {
      const resultado = await crearCobro({
        fecha_cobro: fechaCobro,
        periodo_desde: desde,
        periodo_hasta: hasta,
        plataforma,
        importe_bruto: bruto,
        comisiones: comisiones ?? 0,
        devoluciones: devoluciones ?? 0,
        otros_ajustes: ajustes ?? 0,
        referencia: referencia || null,
        notas: notas || null,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      const c = resultado.datos!.conciliacion;
      const texto = mensajeConciliacion(c, resultado.datos!.plataforma);
      if (c.cuadra) {
        toast.success("Cobro registrado. Las ventas de /diario cuadran.");
      } else {
        // Ámbar y sin cierre automático: es un aviso que hay que leer.
        toast.warning("Cobro registrado, con descuadre", {
          description: texto,
          duration: Infinity,
          closeButton: true,
        });
      }
      limpiar();
    });
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="text-base font-semibold text-text-primary">Registrar un cobro</h2>
      <p className="mt-0.5 text-xs text-text-secondary">
        Copia el desglose del payout de Shopify. No crea ningún ingreso: esas ventas
        ya están en /diario. Solo genera los gastos de comisión y devoluciones.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo id="cobro-fecha" etiqueta="Llegó al banco el">
          <SelectorFecha id="cobro-fecha" valor={fechaCobro} alCambiar={setFechaCobro} />
        </Campo>
        <Campo id="cobro-desde" etiqueta="Ventas desde">
          <SelectorFecha
            id="cobro-desde"
            valor={desde}
            alCambiar={setDesde}
            conAccesosRapidos={false}
          />
        </Campo>
        <Campo id="cobro-hasta" etiqueta="Ventas hasta">
          <SelectorFecha
            id="cobro-hasta"
            valor={hasta}
            alCambiar={setHasta}
            invalido={!periodoValido}
            conAccesosRapidos={false}
          />
        </Campo>
        <Campo id="cobro-plataforma" etiqueta="Plataforma">
          <input
            id="cobro-plataforma"
            value={plataforma}
            onChange={(e) => setPlataforma(e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo id="cobro-bruto" etiqueta="Ventas (bruto)">
          <CampoImporte id="cobro-bruto" valor={bruto} alCambiar={setBruto} sufijo="€" />
        </Campo>
        <Campo id="cobro-comisiones" etiqueta="Comisiones">
          <CampoImporte
            id="cobro-comisiones"
            valor={comisiones}
            alCambiar={setComisiones}
            sufijo="€"
          />
        </Campo>
        <Campo id="cobro-devoluciones" etiqueta="Devoluciones">
          <CampoImporte
            id="cobro-devoluciones"
            valor={devoluciones}
            alCambiar={setDevoluciones}
            sufijo="€"
          />
        </Campo>
        <Campo
          id="cobro-ajustes"
          etiqueta="Otros ajustes"
          ayuda="Negativo si resta (retenciones, contracargos)."
        >
          <CampoImporte id="cobro-ajustes" valor={ajustes} alCambiar={setAjustes} sufijo="€" />
        </Campo>

        <Campo id="cobro-referencia" etiqueta="Referencia del payout (opcional)">
          <input
            id="cobro-referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="p. ej. 98765432"
            className={CLASE_INPUT}
          />
        </Campo>
        <div className="sm:col-span-1 lg:col-span-3">
          <Campo id="cobro-notas" etiqueta="Notas (opcional)">
            <input
              id="cobro-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={CLASE_INPUT}
            />
          </Campo>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-2">
          <p className="cifra text-sm text-text-secondary">
            Neto que llega al banco:{" "}
            <span
              className={cn(
                "text-lg font-semibold",
                neto < 0 ? "text-danger" : "text-text-primary",
              )}
            >
              {formatearEuros(neto)}
            </span>
          </p>

          {previa ? (
            <p
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                previa.cuadra
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning",
              )}
            >
              {previa.cuadra ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              {mensajeConciliacion(previa, plataforma)}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={guardando}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
        >
          {guardando ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Registrar cobro
        </button>
      </div>
    </form>
  );
}
