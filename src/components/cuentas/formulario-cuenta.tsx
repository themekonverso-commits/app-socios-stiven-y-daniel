"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { Textarea } from "@/components/ui/textarea";
import { actualizarCuenta, crearCuenta } from "@/app/acciones/cuentas";
import { formatearEuros, mayusculaInicial } from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import {
  ESTADOS_CUENTA,
  PERIODICIDADES,
  TIPOS_CUENTA,
  type CuentaConCoste,
  type EstadoCuenta,
  type Periodicidad,
} from "@/lib/tipos-cuentas";
import type { Categoria, Divisa, Perfil } from "@/lib/tipos-db";

const CLASE_CAMPO =
  "h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand aria-invalid:border-danger";

type Estado = {
  nombre: string;
  tipo: string;
  email_asociado: string;
  url: string;
  titular_id: string;
  coste: number | null;
  divisa: Divisa;
  periodicidad: Periodicidad;
  fecha_renovacion: string;
  aviso_dias: number;
  categoria_gasto_id: string;
  estado: EstadoCuenta;
  notas: string;
};

function inicial(cuenta: CuentaConCoste | null, usuarioId: string): Estado {
  if (cuenta) {
    return {
      nombre: cuenta.nombre ?? "",
      tipo: cuenta.tipo ?? "herramienta",
      email_asociado: cuenta.email_asociado ?? "",
      url: cuenta.url ?? "",
      titular_id: cuenta.titular_id ?? "",
      coste: cuenta.coste === null ? null : Number(cuenta.coste),
      divisa: (cuenta.divisa as Divisa) ?? "EUR",
      periodicidad: (cuenta.periodicidad as Periodicidad) ?? "mensual",
      fecha_renovacion: cuenta.fecha_renovacion ?? "",
      aviso_dias: Number(cuenta.aviso_dias ?? 7),
      categoria_gasto_id: cuenta.categoria_gasto_id ?? "",
      estado: (cuenta.estado as EstadoCuenta) ?? "activa",
      notas: cuenta.notas ?? "",
    };
  }

  return {
    nombre: "",
    tipo: "herramienta",
    email_asociado: "",
    url: "",
    titular_id: usuarioId,
    coste: null,
    divisa: "EUR",
    periodicidad: "mensual",
    fecha_renovacion: "",
    aviso_dias: 7,
    categoria_gasto_id: "",
    estado: "activa",
    notas: "",
  };
}

export function FormularioCuenta({
  cuenta,
  socios,
  categorias,
  tiposUsados,
  usuarioId,
  tasaUsd,
  alTerminar,
  alCambiarSuciedad,
}: {
  cuenta: CuentaConCoste | null;
  socios: Perfil[];
  categorias: Categoria[];
  tiposUsados: string[];
  usuarioId: string;
  tasaUsd: number | null;
  alTerminar: () => void;
  alCambiarSuciedad: (sucio: boolean) => void;
}) {
  const [datos, setDatos] = useState<Estado>(() => inicial(cuenta, usuarioId));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciarGuardado] = useTransition();
  const nombreRef = useRef<HTMLInputElement>(null);
  const sucioRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => nombreRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  function actualizar(cambios: Partial<Estado>) {
    if (!sucioRef.current) {
      sucioRef.current = true;
      alCambiarSuciedad(true);
    }
    setDatos((anterior) => ({ ...anterior, ...cambios }));
  }

  const esGratuito = datos.periodicidad === "gratuito";
  const sinRenovacion = esGratuito || datos.periodicidad === "puntual";

  /**
   * Equivalente mensual, en vivo. Lo definitivo lo calcula `vw_cuentas_coste`
   * en SQL; esto es solo para que se vea mientras se escribe.
   */
  const equivalenteMensual = useMemo(() => {
    if (esGratuito || datos.coste === null) return null;
    const tasa = datos.divisa === "USD" ? (tasaUsd ?? null) : 1;
    if (tasa === null) return null;

    const enEuros = datos.coste * tasa;
    if (datos.periodicidad === "mensual") return redondear2(enEuros);
    if (datos.periodicidad === "anual") return redondear2(enEuros / 12);
    return 0;
  }, [datos.coste, datos.divisa, datos.periodicidad, esGratuito, tasaUsd]);

  const tiposDisponibles = useMemo(() => {
    const todos = new Set<string>([...TIPOS_CUENTA, ...tiposUsados]);
    if (datos.tipo) todos.add(datos.tipo);
    return [...todos].sort((a, b) => a.localeCompare(b, "es"));
  }, [tiposUsados, datos.tipo]);

  const categoriasGasto = useMemo(
    () => categorias.filter((c) => c.tipo === "gasto"),
    [categorias],
  );

  function validar(): boolean {
    const nuevos: Record<string, string> = {};
    if (!datos.nombre.trim()) nuevos.nombre = "Ponle un nombre a la cuenta.";
    if (!datos.tipo.trim()) nuevos.tipo = "Elige o escribe un tipo.";
    if (!esGratuito && (datos.coste === null || datos.coste <= 0)) {
      nuevos.coste = "Indica el coste, o marca la periodicidad como gratuito.";
    }
    if (!sinRenovacion && !datos.fecha_renovacion) {
      nuevos.fecha_renovacion = "Una cuenta recurrente necesita fecha de renovación.";
    }
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!validar()) {
      toast.error("Revisa los campos marcados.");
      return;
    }

    const payload = {
      nombre: datos.nombre,
      tipo: datos.tipo,
      email_asociado: datos.email_asociado || null,
      url: datos.url || null,
      titular_id: datos.titular_id || null,
      coste: esGratuito ? null : datos.coste,
      divisa: datos.divisa,
      periodicidad: datos.periodicidad,
      fecha_renovacion: sinRenovacion ? null : datos.fecha_renovacion,
      aviso_dias: datos.aviso_dias,
      categoria_gasto_id: datos.categoria_gasto_id || null,
      estado: datos.estado,
      notas: datos.notas || null,
    };

    iniciarGuardado(async () => {
      const resultado = cuenta
        ? await actualizarCuenta(String(cuenta.id), payload)
        : await crearCuenta(payload);

      if (!resultado.ok) {
        if (resultado.campo) {
          setErrores((a) => ({ ...a, [resultado.campo!]: resultado.error }));
        }
        toast.error(resultado.error);
        return;
      }

      toast.success(cuenta ? "Cuenta actualizada." : "Cuenta añadida al inventario.");
      sucioRef.current = false;
      alCambiarSuciedad(false);
      alTerminar();
    });
  }

  return (
    <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cta-nombre" className="text-sm font-medium text-text-primary">
            Nombre
          </label>
          <input
            id="cta-nombre"
            ref={nombreRef}
            value={datos.nombre}
            onChange={(e) => actualizar({ nombre: e.target.value })}
            aria-invalid={errores.nombre ? true : undefined}
            placeholder="Shopify, GoDaddy, Klaviyo…"
            className={CLASE_CAMPO}
          />
          {errores.nombre ? (
            <p role="alert" className="text-xs text-danger">{errores.nombre}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cta-tipo" className="text-sm font-medium text-text-primary">
            Tipo
          </label>
          {/* datalist: se elige de la lista o se escribe uno nuevo. */}
          <input
            id="cta-tipo"
            list="tipos-cuenta"
            value={datos.tipo}
            onChange={(e) => actualizar({ tipo: e.target.value })}
            aria-invalid={errores.tipo ? true : undefined}
            className={CLASE_CAMPO}
          />
          <datalist id="tipos-cuenta">
            {tiposDisponibles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="text-xs text-text-secondary">
            Elige uno de la lista o escribe uno nuevo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cta-email" className="text-sm font-medium text-text-primary">
              Correo asociado
            </label>
            <input
              id="cta-email"
              type="email"
              autoComplete="off"
              value={datos.email_asociado}
              onChange={(e) => actualizar({ email_asociado: e.target.value })}
              placeholder="cuentas@tutienda.com"
              className={CLASE_CAMPO}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cta-url" className="text-sm font-medium text-text-primary">
              URL
            </label>
            <input
              id="cta-url"
              type="url"
              value={datos.url}
              onChange={(e) => actualizar({ url: e.target.value })}
              placeholder="https://…"
              className={CLASE_CAMPO}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Titular</span>
          <SelectorSegmentado
            nombre="cta-titular"
            etiquetaGrupo="Socio titular de la cuenta"
            valor={datos.titular_id}
            opciones={socios.map((s) => ({
              valor: s.id,
              etiqueta: s.nombre,
              color: s.color,
            }))}
            alCambiar={(valor) => actualizar({ titular_id: valor })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Periodicidad</span>
          <SelectorSegmentado
            nombre="cta-periodicidad"
            etiquetaGrupo="Periodicidad del coste"
            valor={datos.periodicidad}
            opciones={PERIODICIDADES.map((p) => ({ valor: p, etiqueta: mayusculaInicial(p) }))}
            alCambiar={(valor) => actualizar({ periodicidad: valor })}
          />
        </div>

        {/* Una cuenta gratuita no tiene coste que pedir. */}
        {!esGratuito ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cta-coste" className="text-xs text-text-secondary">
                  Coste
                </label>
                <CampoImporte
                  id="cta-coste"
                  valor={datos.coste}
                  alCambiar={(valor) => actualizar({ coste: valor })}
                  invalido={Boolean(errores.coste)}
                  sufijo={datos.divisa === "EUR" ? "€" : "$"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">Divisa</span>
                <SelectorSegmentado
                  nombre="cta-divisa"
                  etiquetaGrupo="Divisa del coste"
                  valor={datos.divisa}
                  opciones={[
                    { valor: "EUR", etiqueta: "EUR" },
                    { valor: "USD", etiqueta: "USD" },
                  ]}
                  alCambiar={(valor) => actualizar({ divisa: valor })}
                />
              </div>
            </div>

            {errores.coste ? (
              <p role="alert" className="text-xs text-danger">{errores.coste}</p>
            ) : null}

            <p className="cifra text-sm text-text-secondary">
              {equivalenteMensual === null
                ? datos.divisa === "USD"
                  ? "No hay tasa USD registrada: el equivalente mensual se calculará cuando la haya."
                  : "Equivale a —"
                : `Equivale a ${formatearEuros(equivalenteMensual)}/mes`}
            </p>
          </div>
        ) : null}

        {!sinRenovacion ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cta-renovacion" className="text-sm font-medium text-text-primary">
                Fecha de renovación
              </label>
              <SelectorFecha
                id="cta-renovacion"
                valor={datos.fecha_renovacion}
                alCambiar={(valor) => actualizar({ fecha_renovacion: valor })}
                invalido={Boolean(errores.fecha_renovacion)}
              />
              {errores.fecha_renovacion ? (
                <p role="alert" className="text-xs text-danger">
                  {errores.fecha_renovacion}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cta-aviso" className="text-sm font-medium text-text-primary">
                Avisar con
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cta-aviso"
                  type="number"
                  min={0}
                  max={365}
                  value={datos.aviso_dias}
                  onChange={(e) =>
                    actualizar({ aviso_dias: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className={`${CLASE_CAMPO} cifra text-right`}
                />
                <span className="shrink-0 text-sm text-text-muted">días</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cta-categoria" className="text-sm font-medium text-text-primary">
            Categoría de gasto
          </label>
          <select
            id="cta-categoria"
            value={datos.categoria_gasto_id}
            onChange={(e) => actualizar({ categoria_gasto_id: e.target.value })}
            className={CLASE_CAMPO}
          >
            <option value="">Sin asignar</option>
            {categoriasGasto.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <p className="text-xs text-text-secondary">
            Es la categoría a la que se imputará el gasto al pulsar «Registrar
            pago». Sin ella, ese botón no puede funcionar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Estado</span>
          <SelectorSegmentado
            nombre="cta-estado"
            etiquetaGrupo="Estado de la cuenta"
            valor={datos.estado}
            opciones={ESTADOS_CUENTA.map((e) => ({ valor: e, etiqueta: mayusculaInicial(e) }))}
            alCambiar={(valor) => actualizar({ estado: valor })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cta-notas" className="text-sm font-medium text-text-primary">
            Notas <span className="text-text-muted">(opcional)</span>
          </label>
          <Textarea
            id="cta-notas"
            rows={3}
            value={datos.notas}
            onChange={(e) => actualizar({ notas: e.target.value })}
            placeholder="Plan contratado, condiciones, a quién reclamar…"
            className="min-h-20 rounded-lg border-border bg-surface-2 text-base"
          />
          {/* Aviso deliberado: esto no es una bóveda de credenciales. */}
          <p className="text-xs text-text-muted">
            No escribas aquí contraseñas: este inventario no es un gestor de
            credenciales y no está pensado para guardarlas.
          </p>
        </div>
      </div>

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
            {cuenta ? "Guardar cambios" : "Añadir cuenta"}
          </button>
          <button
            type="button"
            onClick={alTerminar}
            disabled={guardando}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
