"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import {
  consultarVentasRegistradas,
  crearCobro,
  type Solape,
} from "@/app/acciones/cobros";
import {
  calcularNeto,
  conciliar,
  mensajeConciliacion,
  prerrellenoShopify,
} from "@/lib/cobros";
import { PLATAFORMAS_COBRO, type PlataformaCobro } from "@/lib/metodos-cobro";
import type { Tienda } from "@/lib/ambito";
import { formatearEuros, formatearFecha } from "@/lib/formato";
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

function periodoTexto(desde: string, hasta: string) {
  return desde === hasta
    ? formatearFecha(desde)
    : `${formatearFecha(desde)} – ${formatearFecha(hasta)}`;
}

/**
 * Alta de un cobro de la pasarela, con los mismos campos que su desglose.
 *
 * El formulario se adapta a la plataforma (0017):
 *   · Shopify Payments paga al banco los miércoles con las ventas de la
 *     semana anterior: se prerrellena el miércoles más reciente y esa semana
 *     de lunes a domingo.
 *   · PayPal deja el dinero en PayPal el mismo día: desde y hasta son la
 *     fecha del cobro, salvo que se registren varios días de golpe.
 *
 * El neto se calcula en vivo y es el que se guarda. En cuanto hay periodo se
 * enseñan ya las ventas de /diario de ESE método, y si hay otro cobro de la
 * misma plataforma que se solapa (posible duplicado).
 *
 * Siempre es de una tienda concreta (0018): la elige el panel, que no enseña
 * este formulario en «Todas» ni en «General». Ventas y solapes se buscan solo
 * dentro de esa tienda.
 */
export function FormularioCobro({ tienda }: { tienda: Tienda }) {
  const [plataforma, setPlataforma] = useState<PlataformaCobro>("Shopify Payments");
  const [fechaCobro, setFechaCobro] = useState(() => iso(prerrellenoShopify(new Date()).fecha));
  const [desde, setDesde] = useState(() => iso(prerrellenoShopify(new Date()).desde));
  const [hasta, setHasta] = useState(() => iso(prerrellenoShopify(new Date()).hasta));
  const [variosDias, setVariosDias] = useState(false);
  const [bruto, setBruto] = useState<number | null>(null);
  const [comisiones, setComisiones] = useState<number | null>(null);
  const [devoluciones, setDevoluciones] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [ventas, setVentas] = useState<number | null>(null);
  const [solapes, setSolapes] = useState<Solape[]>([]);
  const [confirmarSolape, setConfirmarSolape] = useState<Solape[] | null>(null);
  const [guardando, iniciarGuardado] = useTransition();

  const esPaypal = plataforma === "PayPal";
  // PayPal de un solo día: el periodo es la propia fecha del cobro.
  const periodoDesde = esPaypal && !variosDias ? fechaCobro : desde;
  const periodoHasta = esPaypal && !variosDias ? fechaCobro : hasta;

  const neto = calcularNeto({
    importe_bruto: bruto ?? 0,
    comisiones: comisiones ?? 0,
    devoluciones: devoluciones ?? 0,
    otros_ajustes: ajustes ?? 0,
  });

  const periodoValido = periodoDesde <= periodoHasta;

  function cambiarPlataforma(nueva: PlataformaCobro) {
    setPlataforma(nueva);
    if (nueva === "Shopify Payments") {
      const p = prerrellenoShopify(new Date());
      setFechaCobro(iso(p.fecha));
      setDesde(iso(p.desde));
      setHasta(iso(p.hasta));
    } else {
      const hoy = iso(new Date());
      setFechaCobro(hoy);
      setDesde(hoy);
      setHasta(hoy);
      setVariosDias(false);
    }
  }

  function cambiarVariosDias(activo: boolean) {
    setVariosDias(activo);
    // Al abrir el rango se parte del día del cobro; el usuario lo ensancha.
    if (activo) {
      setDesde(fechaCobro);
      setHasta(fechaCobro);
    }
  }

  // Ventas de /diario del mismo método y solapes, con un pequeño debounce.
  useEffect(() => {
    if (!periodoValido) {
      setVentas(null);
      setSolapes([]);
      return;
    }
    let vigente = true;
    const temporizador = window.setTimeout(async () => {
      const resultado = await consultarVentasRegistradas(
        tienda.id,
        periodoDesde,
        periodoHasta,
        plataforma,
        referencia,
      );
      if (!vigente) return;
      setVentas(resultado.ok ? (resultado.datos?.ventas ?? 0) : null);
      setSolapes(resultado.ok ? (resultado.datos?.solapados ?? []) : []);
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [tienda.id, periodoDesde, periodoHasta, periodoValido, plataforma, referencia]);

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

  function enviar(confirmar: boolean) {
    if (bruto === null || bruto <= 0) {
      toast.error("Escribe el importe bruto de las ventas del cobro.");
      return;
    }
    if (!periodoValido) {
      toast.error("El periodo termina antes de empezar.");
      return;
    }

    iniciarGuardado(async () => {
      const resultado = await crearCobro({
        tienda_id: tienda.id,
        fecha_cobro: fechaCobro,
        periodo_desde: periodoDesde,
        periodo_hasta: periodoHasta,
        plataforma,
        importe_bruto: bruto,
        comisiones: comisiones ?? 0,
        devoluciones: devoluciones ?? 0,
        otros_ajustes: ajustes ?? 0,
        referencia: referencia || null,
        notas: notas || null,
        confirmar_solape: confirmar,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      if (resultado.datos?.solapados?.length) {
        setConfirmarSolape(resultado.datos.solapados);
        return;
      }

      const c = resultado.datos!.conciliacion!;
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
    <>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(false);
        }}
      >
        <p className="text-xs text-text-secondary">
          {esPaypal
            ? "Copia el detalle del cobro de PayPal. No crea ningún ingreso: esas ventas ya están en /diario. El neto queda en la cuenta de PayPal hasta que lo traspases al banco."
            : "Copia el desglose del payout de Shopify. No crea ningún ingreso: esas ventas ya están en /diario. Solo genera los gastos de comisión y devoluciones."}{" "}
          Se registra en{" "}
          <span className="inline-flex items-center gap-1 font-medium text-text-primary">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: tienda.color }}
            />
            {tienda.nombre}
          </span>
          , y concilia solo con sus ventas.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="cobro-plataforma" etiqueta="Plataforma">
            <select
              id="cobro-plataforma"
              value={plataforma}
              onChange={(e) => cambiarPlataforma(e.target.value as PlataformaCobro)}
              className={CLASE_INPUT}
            >
              {PLATAFORMAS_COBRO.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="cobro-fecha"
            etiqueta={esPaypal ? "Llegó a PayPal el" : "Llegó al banco el"}
          >
            <SelectorFecha id="cobro-fecha" valor={fechaCobro} alCambiar={setFechaCobro} />
          </Campo>

          {esPaypal && !variosDias ? (
            <div className="flex flex-col gap-1.5 sm:col-span-1 lg:col-span-2">
              <span className="text-xs text-text-secondary">Ventas de</span>
              <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
                <span className="cifra text-sm text-text-primary">
                  {formatearFecha(fechaCobro)} (el mismo día)
                </span>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text-secondary">
                  <Switch checked={variosDias} onCheckedChange={cambiarVariosDias} />
                  Varios días
                </label>
              </div>
            </div>
          ) : (
            <>
              <Campo
                id="cobro-desde"
                etiqueta="Ventas desde"
                ayuda={esPaypal ? undefined : "Lunes de la semana anterior al pago."}
              >
                <SelectorFecha
                  id="cobro-desde"
                  valor={desde}
                  alCambiar={setDesde}
                  conAccesosRapidos={false}
                />
              </Campo>
              <Campo
                id="cobro-hasta"
                etiqueta="Ventas hasta"
                ayuda={esPaypal ? undefined : "Domingo de esa semana."}
              >
                <SelectorFecha
                  id="cobro-hasta"
                  valor={hasta}
                  alCambiar={setHasta}
                  invalido={!periodoValido}
                  conAccesosRapidos={false}
                />
                {esPaypal ? (
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text-secondary">
                    <Switch checked={variosDias} onCheckedChange={cambiarVariosDias} />
                    Varios días
                  </label>
                ) : null}
              </Campo>
            </>
          )}

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

          <Campo
            id="cobro-referencia"
            etiqueta={esPaypal ? "Id de la transacción (opcional)" : "Referencia del payout (opcional)"}
          >
            <input
              id="cobro-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={esPaypal ? "p. ej. 5TY12345AB678901C" : "p. ej. 98765432"}
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
              {esPaypal ? "Neto que llega a PayPal: " : "Neto que llega al banco: "}
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

            {solapes.length > 0 ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
              >
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Posible duplicado: ya hay {solapes.length === 1 ? "un cobro" : `${solapes.length} cobros`}{" "}
                  de {plataforma} con ventas de estos días (
                  {solapes
                    .map((s) => `${periodoTexto(s.periodo_desde, s.periodo_hasta)}, llegó el ${formatearFecha(s.fecha_cobro)}`)
                    .join("; ")}
                  ).
                </span>
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

      <AlertDialog
        open={confirmarSolape !== null}
        onOpenChange={(abierto) => !abierto && setConfirmarSolape(null)}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Es un cobro distinto?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Ya hay {confirmarSolape?.length === 1 ? "un cobro" : "cobros"} de {plataforma} en{" "}
              {tienda.nombre}{" "}
              que cubre{confirmarSolape?.length === 1 ? "" : "n"} parte de estos días:{" "}
              {confirmarSolape
                ?.map(
                  (s) =>
                    `${periodoTexto(s.periodo_desde, s.periodo_hasta)} (${formatearEuros(s.importe_bruto)}, llegó el ${formatearFecha(s.fecha_cobro)})`,
                )
                .join("; ")}
              . Si es el mismo, cancela: registrarlo dos veces duplicaría el saldo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarSolape(null);
                enviar(true);
              }}
              className="min-h-11 bg-brand text-white hover:bg-brand-hover"
            >
              Es otro, registrarlo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
