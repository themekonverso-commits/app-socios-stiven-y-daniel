"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { parsearNumeroEspanol, redondear2 } from "@/lib/dinero";

/**
 * Campo de importe que entiende cómo escribe la gente en España.
 *
 * Acepta «1.234,56» y también «1234.56». Se guarda el texto tal cual mientras
 * se teclea —para no pelear con el cursor— y al salir del campo se normaliza a
 * dos decimales.
 */
export function CampoImporte({
  id,
  valor,
  alCambiar,
  sufijo,
  autoFocus,
  deshabilitado,
  invalido,
  placeholder = "0,00",
  className,
  alPulsarEnter,
}: {
  id?: string;
  valor: number | null;
  alCambiar: (valor: number | null) => void;
  sufijo?: string;
  autoFocus?: boolean;
  deshabilitado?: boolean;
  invalido?: boolean;
  placeholder?: string;
  className?: string;
  alPulsarEnter?: () => void;
}) {
  const [texto, setTexto] = useState(() =>
    valor === null || valor === 0 ? "" : String(valor).replace(".", ","),
  );

  // El valor puede cambiar desde fuera (cálculo inverso, duplicar, editar).
  useEffect(() => {
    const actual = parsearNumeroEspanol(texto);
    if (valor === null) {
      if (texto !== "") setTexto("");
      return;
    }
    if (actual === null || redondear2(actual) !== redondear2(valor)) {
      setTexto(String(valor).replace(".", ","));
    }
    // Solo debe reaccionar a cambios externos del valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={deshabilitado}
        aria-invalid={invalido || undefined}
        placeholder={placeholder}
        value={texto}
        onChange={(evento) => {
          const bruto = evento.target.value;
          setTexto(bruto);
          alCambiar(parsearNumeroEspanol(bruto));
        }}
        onBlur={() => {
          const numero = parsearNumeroEspanol(texto);
          if (numero === null) {
            setTexto("");
            alCambiar(null);
            return;
          }
          const redondeado = redondear2(numero);
          setTexto(redondeado.toFixed(2).replace(".", ","));
          alCambiar(redondeado);
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter" && alPulsarEnter) {
            evento.preventDefault();
            alPulsarEnter();
          }
        }}
        className={cn(
          "cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand disabled:opacity-60 aria-invalid:border-danger",
          sufijo && "pr-9",
          className,
        )}
      />
      {sufijo ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-text-muted"
        >
          {sufijo}
        </span>
      ) : null}
    </div>
  );
}
