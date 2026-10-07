"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { LoaderCircle } from "lucide-react";
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
import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { registrarVentaDiaria } from "@/app/acciones/movimientos";
import { formatearEntero, formatearEuros, formatearNumero } from "@/lib/formato";
import { convertirAEuros, redondear2 } from "@/lib/dinero";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/metodos-cobro";
import type { Divisa } from "@/lib/tipos-db";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

const CLASE_PEDIDOS =
  "cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand";

type Bloque = { importe: number | null; pedidos: string };
const VACIO: Bloque = { importe: null, pedidos: "" };

/** "" → 0; "3" → 3; "abc" → NaN (se rechaza al enviar). */
function leerPedidos(texto: string): number {
  if (texto.trim() === "") return 0;
  return Number.parseInt(texto, 10);
}

/**
 * Alta rápida de las ventas del día: el ritual de cada noche.
 *
 * Desde la 0017 las ventas van separadas por método de cobro, porque
 * Shopify Payments y PayPal cobran distinto (al banco cada miércoles / a
 * PayPal el mismo día). El total del día y los pedidos totales son la suma:
 * no se escriben, se calculan.
 */
export function FormularioDiario({
  ultimaTasa,
}: {
  ultimaTasa: { fecha: string; tasa: number } | null;
}) {
  const [fecha, setFecha] = useState(() => iso(new Date()));
  const [shopify, setShopify] = useState<Bloque>(VACIO);
  const [paypal, setPaypal] = useState<Bloque>(VACIO);
  const [divisa, setDivisa] = useState<Divisa>("EUR");
  const [tasa, setTasa] = useState<number>(ultimaTasa?.tasa ?? 1);
  const [confirmarSobrescribir, setConfirmarSobrescribir] = useState(false);
  const [guardando, iniciarGuardado] = useTransition();

  const primerCampoRef = useRef<HTMLInputElement>(null);

  const pedidosShopify = leerPedidos(shopify.pedidos);
  const pedidosPaypal = leerPedidos(paypal.pedidos);
  const totalImporte = redondear2((shopify.importe ?? 0) + (paypal.importe ?? 0));
  const totalPedidos =
    (Number.isFinite(pedidosShopify) ? pedidosShopify : 0) +
    (Number.isFinite(pedidosPaypal) ? pedidosPaypal : 0);

  const simbolo = divisa === "EUR" ? "€" : "$";
  const equivalente =
    divisa === "USD" && totalImporte > 0 && tasa > 0
      ? convertirAEuros(totalImporte, tasa)
      : null;

  function validar(): string | null {
    for (const [metodo, bloque, pedidos] of [
      ["shopify_payments", shopify, pedidosShopify],
      ["paypal", paypal, pedidosPaypal],
    ] as const) {
      const nombre = ETIQUETA_METODO[metodo];
      if (!Number.isFinite(pedidos) || pedidos < 0) {
        return `El número de pedidos de ${nombre} no es válido.`;
      }
      if ((bloque.importe ?? 0) < 0) return `El importe de ${nombre} no puede ser negativo.`;
      if ((bloque.importe ?? 0) === 0 && pedidos > 0) {
        return `Hay pedidos de ${nombre} sin importe.`;
      }
    }
    if (totalImporte <= 0) return "Escribe las ventas del día de al menos un método.";
    return null;
  }

  function enviar(sobrescribir: boolean) {
    const error = validar();
    if (error) {
      toast.error(error);
      primerCampoRef.current?.focus();
      return;
    }

    iniciarGuardado(async () => {
      const resultado = await registrarVentaDiaria({
        fecha,
        shopify_importe: shopify.importe ?? 0,
        shopify_pedidos: pedidosShopify,
        paypal_importe: paypal.importe ?? 0,
        paypal_pedidos: pedidosPaypal,
        divisa,
        tasa_cambio: divisa === "EUR" ? 1 : tasa,
        sobrescribir,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      if (resultado.datos?.duplicado) {
        setConfirmarSobrescribir(true);
        return;
      }

      toast.success(
        sobrescribir ? "Registro del día actualizado." : "Ventas registradas.",
      );
      setShopify(VACIO);
      setPaypal(VACIO);
      primerCampoRef.current?.focus();
    });
  }

  function renderBloque({
    metodo,
    bloque,
    alCambiar,
    primero,
  }: {
    metodo: MetodoCobro;
    bloque: Bloque;
    alCambiar: (bloque: Bloque) => void;
    primero?: boolean;
  }) {
    const id = `diario-${metodo}`;
    return (
      <fieldset className="rounded-lg border border-border bg-base p-3">
        <legend className="px-1 text-xs font-semibold text-text-primary">
          Ventas {ETIQUETA_METODO[metodo]}
        </legend>
        <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-pedidos`} className="text-xs text-text-secondary">
              Nº de pedidos
            </label>
            <input
              id={`${id}-pedidos`}
              ref={primero ? primerCampoRef : undefined}
              type="number"
              min={0}
              inputMode="numeric"
              autoFocus={primero}
              value={bloque.pedidos}
              onChange={(evento) => alCambiar({ ...bloque, pedidos: evento.target.value })}
              placeholder="0"
              className={CLASE_PEDIDOS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-importe`} className="text-xs text-text-secondary">
              Importe bruto
            </label>
            <CampoImporte
              id={`${id}-importe`}
              valor={bloque.importe}
              alCambiar={(importe) => alCambiar({ ...bloque, importe })}
              sufijo={simbolo}
            />
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(false);
        }}
        className="rounded-xl border border-border bg-surface p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.6fr)] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="diario-fecha" className="text-xs text-text-secondary">
              Fecha
            </label>
            <SelectorFecha id="diario-fecha" valor={fecha} alCambiar={setFecha} />
          </div>

          {/* Se llaman como función y no como componente: definidos dentro
              del render, React los remontaría en cada tecla y el campo perdería
              el foco. */}
          {renderBloque({
            metodo: "shopify_payments",
            bloque: shopify,
            alCambiar: setShopify,
            primero: true,
          })}
          {renderBloque({ metodo: "paypal", bloque: paypal, alCambiar: setPaypal })}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-secondary">Divisa</span>
            <SelectorSegmentado
              nombre="diario-divisa"
              etiquetaGrupo="Divisa de las ventas"
              valor={divisa}
              opciones={[
                { valor: "EUR", etiqueta: "EUR" },
                { valor: "USD", etiqueta: "USD" },
              ]}
              alCambiar={(valor) => {
                setDivisa(valor);
                if (valor === "USD" && ultimaTasa) setTasa(ultimaTasa.tasa);
                if (valor === "EUR") setTasa(1);
              }}
            />
          </div>
        </div>

        {divisa === "USD" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <label htmlFor="diario-tasa" className="text-xs text-text-secondary">
              Tasa 1 USD =
            </label>
            <input
              id="diario-tasa"
              type="text"
              inputMode="decimal"
              value={String(tasa)}
              onChange={(evento) => {
                const valor = Number(evento.target.value.replace(",", "."));
                setTasa(Number.isFinite(valor) ? valor : 0);
              }}
              className="cifra h-11 w-32 rounded-lg border border-border bg-surface-2 px-3 text-right text-sm text-text-primary outline-none focus-visible:border-brand"
            />
            <span className="text-xs text-text-secondary">EUR</span>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center">
          <p className="cifra flex-1 text-sm text-text-secondary" aria-live="polite">
            Total del día:{" "}
            <span className="text-base font-semibold text-text-primary">
              {divisa === "EUR"
                ? formatearEuros(totalImporte)
                : `${formatearNumero(totalImporte)} $`}
            </span>
            {equivalente !== null ? (
              <span className="ml-1 text-text-muted">≈ {formatearEuros(equivalente)}</span>
            ) : null}
            <span className="mx-2 text-text-muted">·</span>
            {formatearEntero(totalPedidos)} pedido{totalPedidos === 1 ? "" : "s"}
          </p>

          <button
            type="submit"
            disabled={guardando}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
          >
            {guardando ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Registrar
          </button>
        </div>
      </form>

      <AlertDialog
        open={confirmarSobrescribir}
        onOpenChange={setConfirmarSobrescribir}
      >
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              Ya hay ventas registradas ese día
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Si continúas, las ventas de ese día se sustituyen por las nuevas en
              lugar de sumarse, en los dos métodos: un método que dejes a cero se
              borra. Duplicar las ventas de un día descuadraría toda la caja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarSobrescribir(false);
                enviar(true);
              }}
              className="min-h-11 bg-brand text-white hover:bg-brand-hover"
            >
              Sobrescribir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
