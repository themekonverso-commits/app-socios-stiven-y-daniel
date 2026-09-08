"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { ChevronDown, LoaderCircle, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import {
  ComboboxCategoria,
  type SeleccionCategoria,
} from "@/components/campos/combobox-categoria";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { calcularDesdeBase, calcularDesdeTotal, convertirAEuros } from "@/lib/dinero";
import { formatearEuros, formatearNumero } from "@/lib/formato";
import { PLATAFORMAS, TIPOS_IVA } from "@/lib/esquemas/movimiento";
import {
  actualizarMovimiento,
  crearMovimiento,
} from "@/app/acciones/movimientos";
import type {
  Categoria,
  Divisa,
  MovimientoConRelaciones,
  Perfil,
  Plataforma,
  TipoMovimiento,
} from "@/lib/tipos-db";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

export type ModoFormulario = "crear" | "editar" | "duplicar";

type EstadoFormulario = {
  tipo: TipoMovimiento;
  fecha: string;
  concepto: string;
  categoria: SeleccionCategoria | null;
  divisa: Divisa;
  tasa_cambio: number | null;
  base: number | null;
  iva_tipo: number;
  iva_importe: number;
  total: number | null;
  anticipado_por: string | null;
  plataforma: Plataforma | null;
  impresiones: number | null;
  clicks: number | null;
  notas: string;
};

function estadoInicial(
  movimiento: MovimientoConRelaciones | null,
  modo: ModoFormulario,
  usuarioId: string,
): EstadoFormulario {
  if (movimiento) {
    return {
      tipo: movimiento.tipo,
      // Al duplicar, la fecha se pone a hoy: es justo para lo que sirve.
      fecha: modo === "duplicar" ? iso(new Date()) : movimiento.fecha,
      concepto: movimiento.concepto,
      categoria: movimiento.categorias
        ? {
            tipo: "existente",
            id: movimiento.categorias.id,
            nombre: movimiento.categorias.nombre,
          }
        : null,
      divisa: movimiento.divisa,
      tasa_cambio: Number(movimiento.tasa_cambio) || 1,
      base: Number(movimiento.base_imponible),
      iva_tipo: Number(movimiento.iva_tipo),
      iva_importe: Number(movimiento.iva_importe),
      total: Number(movimiento.total),
      anticipado_por: movimiento.anticipado_por,
      plataforma: (movimiento.plataforma as Plataforma | null) ?? null,
      impresiones: movimiento.impresiones,
      clicks: movimiento.clicks,
      notas: movimiento.notas ?? "",
    };
  }

  return {
    tipo: "gasto",
    fecha: iso(new Date()),
    concepto: "",
    categoria: null,
    divisa: "EUR",
    tasa_cambio: 1,
    base: null,
    iva_tipo: 21,
    iva_importe: 0,
    total: null,
    anticipado_por: usuarioId,
    plataforma: null,
    impresiones: null,
    clicks: null,
    notas: "",
  };
}

export function FormularioMovimiento({
  modo,
  movimiento,
  categorias,
  socios,
  conceptos,
  usuarioId,
  ultimaTasa,
  alTerminar,
  alCambiarSuciedad,
}: {
  modo: ModoFormulario;
  movimiento: MovimientoConRelaciones | null;
  categorias: Categoria[];
  socios: Perfil[];
  conceptos: string[];
  usuarioId: string;
  ultimaTasa: { fecha: string; tasa: number } | null;
  /** Se llama al guardar y cerrar, o al cancelar. */
  alTerminar: () => void;
  alCambiarSuciedad: (sucio: boolean) => void;
}) {
  const [datos, setDatos] = useState<EstadoFormulario>(() =>
    estadoInicial(movimiento, modo, usuarioId),
  );
  const [modoTotal, setModoTotal] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [publicidadAbierta, setPublicidadAbierta] = useState(true);
  const [guardando, iniciarGuardado] = useTransition();

  const conceptoRef = useRef<HTMLInputElement>(null);
  const sucioRef = useRef(false);

  // Foco automático en concepto al abrir: es el primer campo que se escribe.
  useEffect(() => {
    const temporizador = window.setTimeout(() => conceptoRef.current?.focus(), 80);
    return () => window.clearTimeout(temporizador);
  }, []);

  const marcarSucio = useCallback(() => {
    if (!sucioRef.current) {
      sucioRef.current = true;
      alCambiarSuciedad(true);
    }
  }, [alCambiarSuciedad]);

  const actualizar = useCallback(
    (cambios: Partial<EstadoFormulario>) => {
      marcarSucio();
      setDatos((anterior) => ({ ...anterior, ...cambios }));
    },
    [marcarSucio],
  );

  const esGasto = datos.tipo === "gasto";
  const esPublicidad = datos.categoria?.nombre.toLowerCase() === "publicidad";
  const tasa = datos.divisa === "EUR" ? 1 : (datos.tasa_cambio ?? 0);

  const totalEnEuros = useMemo(() => {
    if (datos.total === null) return null;
    if (datos.divisa === "EUR") return datos.total;
    if (!tasa) return null;
    return convertirAEuros(datos.total, tasa);
  }, [datos.total, datos.divisa, tasa]);

  /** Recalcula base, IVA y total según cuál de los dos se esté escribiendo. */
  const recalcular = useCallback(
    (
      origen: "base" | "total" | "iva",
      valores: { base?: number | null; total?: number | null; iva_tipo?: number },
    ) => {
      const tipoIva = valores.iva_tipo ?? datos.iva_tipo;

      if (origen === "total" || (origen === "iva" && modoTotal)) {
        const total = valores.total ?? datos.total;
        if (total === null) {
          actualizar({ total: null, base: null, iva_importe: 0, iva_tipo: tipoIva });
          return;
        }
        const calculo = calcularDesdeTotal(total, tipoIva);
        actualizar({
          iva_tipo: tipoIva,
          base: calculo.base,
          iva_importe: calculo.ivaImporte,
          total: calculo.total,
        });
        return;
      }

      const base = valores.base ?? datos.base;
      if (base === null) {
        actualizar({ base: null, total: null, iva_importe: 0, iva_tipo: tipoIva });
        return;
      }
      const calculo = calcularDesdeBase(base, tipoIva);
      actualizar({
        iva_tipo: tipoIva,
        base: calculo.base,
        iva_importe: calculo.ivaImporte,
        total: calculo.total,
      });
    },
    [actualizar, datos.base, datos.total, datos.iva_tipo, modoTotal],
  );

  function construirPayload() {
    return {
      tipo: datos.tipo,
      fecha: datos.fecha,
      concepto: datos.concepto,
      categoria_id:
        datos.categoria?.tipo === "existente" ? datos.categoria.id : null,
      categoria_nueva:
        datos.categoria?.tipo === "nueva" ? datos.categoria.nombre : undefined,
      divisa: datos.divisa,
      tasa_cambio: datos.divisa === "EUR" ? 1 : (datos.tasa_cambio ?? 0),
      base_imponible: datos.base ?? 0,
      iva_tipo: datos.iva_tipo,
      iva_importe: datos.iva_importe,
      total: datos.total ?? 0,
      anticipado_por: esGasto ? datos.anticipado_por : null,
      plataforma: esPublicidad ? datos.plataforma : null,
      impresiones: esPublicidad ? datos.impresiones : null,
      clicks: esPublicidad ? datos.clicks : null,
      notas: datos.notas || null,
    };
  }

  /** Validación de cortesía en cliente. La que manda es la del servidor. */
  function validar(): boolean {
    const nuevos: Record<string, string> = {};

    if (!datos.concepto.trim()) nuevos.concepto = "Escribe un concepto.";
    if (!datos.categoria) nuevos.categoria_id = "Elige una categoría.";
    if (datos.base === null || datos.base <= 0) {
      nuevos.base_imponible = "Escribe un importe mayor que cero.";
    }
    if (datos.divisa === "USD" && (!datos.tasa_cambio || datos.tasa_cambio <= 0)) {
      nuevos.tasa_cambio = "Indica la tasa de cambio.";
    }
    if (esGasto && !datos.anticipado_por) {
      nuevos.anticipado_por = "Indica quién adelantó el dinero.";
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  function guardar(cerrar: boolean) {
    if (!validar()) {
      toast.error("Revisa los campos marcados.");
      return;
    }

    iniciarGuardado(async () => {
      const payload = construirPayload();

      const resultado =
        modo === "editar" && movimiento
          ? await actualizarMovimiento(movimiento.id, payload)
          : await crearMovimiento(payload);

      if (!resultado.ok) {
        if (resultado.campo) {
          setErrores((anterior) => ({
            ...anterior,
            [resultado.campo!]: resultado.error,
          }));
        }
        toast.error(resultado.error);
        return;
      }

      toast.success(
        modo === "editar" ? "Movimiento actualizado." : "Movimiento guardado.",
      );

      if (cerrar) {
        sucioRef.current = false;
        alCambiarSuciedad(false);
        alTerminar();
        return;
      }

      // «Guardar y añadir otro»: se limpia lo que cambia de un registro al
      // siguiente y se conserva el contexto (tipo, fecha, categoría, divisa,
      // socio), que es lo que se repite al meter varias facturas seguidas.
      setDatos((anterior) => ({
        ...anterior,
        concepto: "",
        base: null,
        total: null,
        iva_importe: 0,
        impresiones: null,
        clicks: null,
        notas: "",
      }));
      setErrores({});
      sucioRef.current = false;
      alCambiarSuciedad(false);
      conceptoRef.current?.focus();
    });
  }

  // Ctrl/Cmd+Enter guarda y cierra desde cualquier punto del formulario.
  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key === "Enter") {
        evento.preventDefault();
        guardar(true);
      }
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  });

  const idLista = "conceptos-usados";

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        guardar(true);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6">
        {/* 1 · TIPO */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Tipo</span>
          <SelectorSegmentado
            nombre="tipo"
            etiquetaGrupo="Tipo de movimiento"
            valor={datos.tipo}
            opciones={[
              { valor: "gasto", etiqueta: "Gasto" },
              { valor: "ingreso", etiqueta: "Ingreso" },
            ]}
            alCambiar={(valor) =>
              // Al cambiar de tipo la categoría deja de tener sentido.
              actualizar({ tipo: valor, categoria: null })
            }
          />
        </div>

        {/* 2 · FECHA */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-fecha" className="text-sm font-medium text-text-primary">
            Fecha
          </label>
          <SelectorFecha
            id="campo-fecha"
            valor={datos.fecha}
            alCambiar={(valor) => actualizar({ fecha: valor })}
          />
        </div>

        {/* 3 · CONCEPTO */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-concepto" className="text-sm font-medium text-text-primary">
            Concepto
          </label>
          <input
            id="campo-concepto"
            ref={conceptoRef}
            type="text"
            list={idLista}
            autoComplete="off"
            value={datos.concepto}
            onChange={(evento) => actualizar({ concepto: evento.target.value })}
            aria-invalid={errores.concepto ? true : undefined}
            aria-describedby={errores.concepto ? "error-concepto" : undefined}
            placeholder="Factura Meta Ads, pedido CJ…"
            className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand aria-invalid:border-danger"
          />
          <datalist id={idLista}>
            {conceptos.map((concepto) => (
              <option key={concepto} value={concepto} />
            ))}
          </datalist>
          {errores.concepto ? (
            <p id="error-concepto" role="alert" className="text-xs text-danger">
              {errores.concepto}
            </p>
          ) : null}
        </div>

        {/* 4 · CATEGORÍA */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-categoria" className="text-sm font-medium text-text-primary">
            Categoría
          </label>
          <ComboboxCategoria
            id="campo-categoria"
            categorias={categorias}
            tipo={datos.tipo}
            seleccion={datos.categoria}
            invalido={Boolean(errores.categoria_id)}
            alCambiar={(seleccion) => actualizar({ categoria: seleccion })}
          />
          {errores.categoria_id ? (
            <p role="alert" className="text-xs text-danger">
              {errores.categoria_id}
            </p>
          ) : (
            <p className="text-xs text-text-secondary">
              Escribe un nombre nuevo para crear una categoría al vuelo.
            </p>
          )}
        </div>

        {/* 5 · DIVISA */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Divisa</span>
          <SelectorSegmentado
            nombre="divisa"
            etiquetaGrupo="Divisa"
            valor={datos.divisa}
            opciones={[
              { valor: "EUR", etiqueta: "EUR" },
              { valor: "USD", etiqueta: "USD" },
            ]}
            alCambiar={(valor) =>
              actualizar({
                divisa: valor,
                tasa_cambio: valor === "EUR" ? 1 : (ultimaTasa?.tasa ?? null),
              })
            }
          />
        </div>

        {/* 6 · TASA DE CAMBIO (solo USD) */}
        {datos.divisa === "USD" ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3">
            <label htmlFor="campo-tasa" className="text-sm font-medium text-text-primary">
              Tasa de cambio
            </label>
            <div className="flex gap-2">
              <input
                id="campo-tasa"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={datos.tasa_cambio === null ? "" : String(datos.tasa_cambio)}
                onChange={(evento) => {
                  const valor = Number(evento.target.value.replace(",", "."));
                  actualizar({
                    tasa_cambio: Number.isFinite(valor) && valor > 0 ? valor : null,
                  });
                }}
                aria-invalid={errores.tasa_cambio ? true : undefined}
                placeholder="0,920000"
                className="cifra h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand aria-invalid:border-danger"
              />
              <button
                type="button"
                onClick={() => {
                  if (!ultimaTasa) {
                    toast.warning(
                      "Todavía no hay ninguna tasa guardada. Introdúcela a mano esta primera vez.",
                    );
                    return;
                  }
                  actualizar({ tasa_cambio: ultimaTasa.tasa });
                  toast.success("Tasa aplicada.");
                }}
                className="min-h-11 shrink-0 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
              >
                Usar última tasa
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              1 USD = {datos.tasa_cambio ?? "—"} EUR
              {ultimaTasa ? ` · última guardada: ${ultimaTasa.tasa}` : ""}
            </p>
            {errores.tasa_cambio ? (
              <p role="alert" className="text-xs text-danger">
                {errores.tasa_cambio}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 7 · IMPORTE */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-text-primary">Importe</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
              <Switch
                checked={modoTotal}
                onCheckedChange={(activo) => {
                  setModoTotal(activo);
                  // Al cambiar de modo se recalcula desde el campo que pasa a
                  // mandar, para que base, IVA y total nunca se contradigan.
                  if (activo && datos.total !== null) {
                    const calculo = calcularDesdeTotal(datos.total, datos.iva_tipo);
                    actualizar({
                      base: calculo.base,
                      iva_importe: calculo.ivaImporte,
                      total: calculo.total,
                    });
                  } else if (!activo && datos.base !== null) {
                    const calculo = calcularDesdeBase(datos.base, datos.iva_tipo);
                    actualizar({
                      base: calculo.base,
                      iva_importe: calculo.ivaImporte,
                      total: calculo.total,
                    });
                  }
                }}
              />
              Introducir el total directamente
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="campo-base" className="text-xs text-text-secondary">
                Base imponible
              </label>
              <CampoImporte
                id="campo-base"
                valor={datos.base}
                deshabilitado={modoTotal}
                invalido={Boolean(errores.base_imponible)}
                alCambiar={(valor) => recalcular("base", { base: valor })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="campo-iva" className="text-xs text-text-secondary">
                IVA
              </label>
              <select
                id="campo-iva"
                value={datos.iva_tipo}
                onChange={(evento) =>
                  recalcular("iva", { iva_tipo: Number(evento.target.value) })
                }
                className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary transition-colors outline-none focus-visible:border-brand"
              >
                {TIPOS_IVA.map((tipoIva) => (
                  <option key={tipoIva} value={tipoIva}>
                    {tipoIva} %
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <label htmlFor="campo-total" className="text-xs text-text-secondary">
                Total {modoTotal ? "" : "(calculado)"}
              </label>
              {modoTotal ? (
                <CampoImporte
                  id="campo-total"
                  valor={datos.total}
                  invalido={Boolean(errores.base_imponible)}
                  alCambiar={(valor) => recalcular("total", { total: valor })}
                />
              ) : (
                <output
                  id="campo-total"
                  className="cifra flex h-11 items-center justify-end overflow-hidden rounded-lg border border-border bg-base px-3 text-base font-semibold whitespace-nowrap text-text-primary sm:text-lg"
                >
                  {datos.total === null
                    ? "—"
                    : datos.divisa === "EUR"
                      ? formatearEuros(datos.total)
                      : `${formatearNumero(datos.total)} $`}
                </output>
              )}
            </div>
          </div>

          {errores.base_imponible ? (
            <p role="alert" className="text-xs text-danger">
              {errores.base_imponible}
            </p>
          ) : null}

          {datos.divisa === "USD" && totalEnEuros !== null ? (
            <p className="cifra text-right text-sm text-text-secondary">
              ≈ {formatearEuros(totalEnEuros)}
            </p>
          ) : null}
        </div>

        {/* 8 · ANTICIPADO POR (solo gastos) */}
        {esGasto ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">
              Anticipado por
            </span>
            <SelectorSegmentado
              nombre="anticipado"
              etiquetaGrupo="Socio que adelantó el dinero"
              valor={datos.anticipado_por ?? ""}
              opciones={socios.map((socio) => ({
                valor: socio.id,
                etiqueta: socio.nombre,
                color: socio.color,
              }))}
              alCambiar={(valor) => actualizar({ anticipado_por: valor })}
            />
            {errores.anticipado_por ? (
              <p role="alert" className="text-xs text-danger">
                {errores.anticipado_por}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 9 · CAMPOS DE PUBLICIDAD */}
        {esPublicidad ? (
          <div className="rounded-xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => setPublicidadAbierta((valor) => !valor)}
              aria-expanded={publicidadAbierta}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium text-text-primary"
            >
              <Megaphone aria-hidden="true" className="size-4 text-brand" />
              Datos de la campaña
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "ml-auto size-4 text-text-muted transition-transform",
                  publicidadAbierta && "rotate-180",
                )}
              />
            </button>

            {publicidadAbierta ? (
              <div className="flex flex-col gap-3 border-t border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-text-secondary">Plataforma</span>
                  <SelectorSegmentado
                    nombre="plataforma"
                    etiquetaGrupo="Plataforma de la campaña"
                    valor={datos.plataforma ?? ""}
                    opciones={PLATAFORMAS.map((plataforma) => ({
                      valor: plataforma,
                      etiqueta: plataforma,
                    }))}
                    alCambiar={(valor) =>
                      actualizar({ plataforma: valor as Plataforma })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="campo-impresiones"
                      className="text-xs text-text-secondary"
                    >
                      Impresiones (opcional)
                    </label>
                    <input
                      id="campo-impresiones"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={datos.impresiones ?? ""}
                      onChange={(evento) =>
                        actualizar({
                          impresiones: evento.target.value
                            ? Number(evento.target.value)
                            : null,
                        })
                      }
                      className="cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="campo-clicks" className="text-xs text-text-secondary">
                      Clicks (opcional)
                    </label>
                    <input
                      id="campo-clicks"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={datos.clicks ?? ""}
                      onChange={(evento) =>
                        actualizar({
                          clicks: evento.target.value
                            ? Number(evento.target.value)
                            : null,
                        })
                      }
                      className="cifra h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-right text-base text-text-primary outline-none focus-visible:border-brand"
                    />
                  </div>
                </div>

                <p className="text-xs text-text-muted">
                  Estos datos alimentarán el ROAS en la fase 2.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 10 · NOTAS */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-notas" className="text-sm font-medium text-text-primary">
            Notas <span className="text-text-muted">(opcional)</span>
          </label>
          <Textarea
            id="campo-notas"
            rows={3}
            value={datos.notas}
            onChange={(evento) => actualizar({ notas: evento.target.value })}
            placeholder="Número de factura, referencia del pedido…"
            className="min-h-20 rounded-lg border-border bg-surface-2 text-base"
          />
        </div>
      </div>

      {/* ACCIONES */}
      <div className="shrink-0 border-t border-border bg-base p-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={guardando}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
          >
            {guardando ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Guardar y cerrar
          </button>

          {modo !== "editar" ? (
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar(false)}
              className="min-h-11 flex-1 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-60"
            >
              Guardar y añadir otro
            </button>
          ) : null}

          <button
            type="button"
            disabled={guardando}
            onClick={alTerminar}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary sm:flex-none"
          >
            Cancelar
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-text-muted">
          <kbd className="rounded border border-border px-1">Ctrl</kbd> +{" "}
          <kbd className="rounded border border-border px-1">Intro</kbd> guarda y
          cierra · <kbd className="rounded border border-border px-1">Esc</kbd>{" "}
          cancela
        </p>
      </div>
    </form>
  );
}
