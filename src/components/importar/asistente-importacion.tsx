"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { ZonaSubida } from "@/components/importar/zona-subida";
import { CampoImporte } from "@/components/campos/campo-importe";
import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import {
  ejecutarImportacion,
  guardarMapeo,
  validarImportacion,
  type FilaValidada,
} from "@/app/acciones/importacion";
import { cn } from "@/lib/utils";
import { formatearEntero, formatearEuros, formatearFecha } from "@/lib/formato";
import { redondear2 } from "@/lib/dinero";
import {
  CAMPOS_DESTINO,
  detectarOrigen,
  parsearDivisa,
  parsearFecha,
  parsearImporte,
  proponerMapeo,
  type CampoDestino,
  type ResultadoLectura,
} from "@/lib/csv";
import type { MapeoGuardado } from "@/lib/consultas-importacion";
import type { Categoria } from "@/lib/tipos-db";

const PASOS = ["Archivo", "Mapeo", "Agrupación", "Revisión", "Confirmar"] as const;

type Mapeo = Partial<Record<CampoDestino, string>>;
type Agregacion = "fila" | "dia";

const CLASE_CAMPO =
  "h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary outline-none focus-visible:border-brand";

export function AsistenteImportacion({
  categorias,
  mapeos,
  tasaUsd,
}: {
  categorias: Categoria[];
  mapeos: MapeoGuardado[];
  tasaUsd: number | null;
}) {
  const router = useRouter();

  const [paso, setPaso] = useState(0);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [agregacion, setAgregacion] = useState<Agregacion>("fila");
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("ingreso");
  const [categoriaId, setCategoriaId] = useState("");
  const [tasa, setTasa] = useState<number | null>(tasaUsd ?? 1);
  const [validadas, setValidadas] = useState<FilaValidada[]>([]);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [nombreMapeo, setNombreMapeo] = useState("");

  const [validando, iniciarValidacion] = useTransition();
  const [importando, iniciarImportacion] = useTransition();

  const categoriasDelTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo),
    [categorias, tipo],
  );

  /** Aplica el mapeo a las filas crudas y, si toca, las agrupa por día. */
  const filasPreparadas = useMemo(() => {
    if (!lectura) return [];

    const base = lectura.filas.map((fila, indice) => ({
      indice,
      fecha: mapeo.fecha ? parsearFecha(fila[mapeo.fecha] ?? "") : null,
      concepto: mapeo.concepto ? String(fila[mapeo.concepto] ?? "").slice(0, 200) : "",
      importe: mapeo.importe ? parsearImporte(fila[mapeo.importe] ?? "") : null,
      divisa: mapeo.divisa ? (parsearDivisa(fila[mapeo.divisa] ?? "") ?? "?") : "EUR",
      num_pedidos: mapeo.num_pedidos
        ? Number.parseInt(fila[mapeo.num_pedidos] ?? "", 10) || null
        : null,
    }));

    if (agregacion === "fila") return base;

    // Agrupar por día: suma los importes de cada fecha y cuenta los pedidos.
    // Es lo que convierte un export de pedidos de Shopify en un movimiento
    // diario, igual que el de /diario.
    const porDia = new Map<string, (typeof base)[number] & { pedidos: number }>();

    for (const fila of base) {
      if (!fila.fecha) continue;
      const actual = porDia.get(fila.fecha);

      if (actual) {
        actual.importe = redondear2((actual.importe ?? 0) + (fila.importe ?? 0));
        actual.pedidos += 1;
      } else {
        porDia.set(fila.fecha, { ...fila, pedidos: 1 });
      }
    }

    return [...porDia.values()]
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map((fila, indice) => ({
        indice,
        fecha: fila.fecha,
        concepto: `Ventas del ${fila.fecha ? formatearFecha(fila.fecha) : ""}`,
        importe: fila.importe,
        divisa: fila.divisa,
        num_pedidos: fila.num_pedidos ?? fila.pedidos,
      }));
  }, [lectura, mapeo, agregacion]);

  const resumen = useMemo(() => {
    const listas = validadas.filter((f) => f.estado === "ok" && !excluidas.has(f.indice));
    const duplicadas = validadas.filter((f) => f.estado === "duplicado");
    const erroneas = validadas.filter((f) => f.estado === "error");

    return {
      listas,
      duplicadas: duplicadas.length,
      erroneas: erroneas.length,
      total: redondear2(
        listas.reduce(
          (s, f) => s + (f.importe ?? 0) * (f.divisa === "USD" ? (tasa ?? 1) : 1),
          0,
        ),
      ),
      desde: listas.length > 0
        ? listas.map((f) => f.fecha!).reduce((a, b) => (a < b ? a : b))
        : null,
      hasta: listas.length > 0
        ? listas.map((f) => f.fecha!).reduce((a, b) => (a > b ? a : b))
        : null,
    };
  }, [validadas, excluidas, tasa]);

  const camposObligatoriosOk = Boolean(mapeo.fecha && mapeo.importe);
  const sinAsignar = lectura
    ? lectura.cabeceras.filter((c) => !Object.values(mapeo).includes(c))
    : [];

  function validar() {
    iniciarValidacion(async () => {
      const resultado = await validarImportacion({ filas: filasPreparadas, tipo });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setValidadas(resultado.datos?.filas ?? []);
      setExcluidas(new Set());
      setPaso(3);
    });
  }

  function importar() {
    if (!categoriaId) {
      toast.error("Elige la categoría a la que se imputan los movimientos.");
      return;
    }

    iniciarImportacion(async () => {
      const resultado = await ejecutarImportacion({
        nombre_archivo: archivo?.name ?? "importacion.csv",
        origen: lectura ? detectarOrigen(lectura.cabeceras) : "CSV",
        categoria_id: categoriaId,
        tipo,
        tasa_cambio: tasa ?? 1,
        filas_totales: lectura?.filas.length ?? 0,
        filas_omitidas: (lectura?.filas.length ?? 0) - resumen.listas.length,
        filas: resumen.listas.map((f) => ({
          fecha: f.fecha!,
          concepto: f.concepto,
          importe: f.importe!,
          divisa: f.divisa as "EUR" | "USD",
          num_pedidos: f.num_pedidos,
        })),
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success(
        `${formatearEntero(resultado.datos?.creados ?? 0)} movimientos importados por ${formatearEuros(resultado.datos?.importe_total_eur ?? 0)}.`,
      );

      // Vuelta al principio para poder importar otro archivo.
      setPaso(0);
      setArchivo(null);
      setLectura(null);
      setValidadas([]);
      router.refresh();
    });
  }

  /** Descarga las filas rechazadas para corregirlas y reintentar. */
  function descargarRechazadas() {
    const rechazadas = validadas.filter((f) => f.estado !== "ok");
    const lineas = [
      "Fila;Fecha;Concepto;Importe;Divisa;Motivo",
      ...rechazadas.map((f) =>
        [
          f.indice + 1,
          f.fecha ?? "",
          `"${f.concepto.replace(/"/g, '""')}"`,
          f.importe ?? "",
          f.divisa,
          `"${f.motivo ?? ""}"`,
        ].join(";"),
      ),
    ];

    const blob = new Blob([`﻿${lineas.join("\r\n")}\r\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `filas-rechazadas-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Indicador de progreso */}
      <ol className="flex flex-wrap items-center gap-2">
        {PASOS.map((etiqueta, indice) => (
          <li key={etiqueta} className="flex items-center gap-2">
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
              {indice < paso ? <Check aria-hidden="true" className="size-3.5" /> : indice + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                indice === paso ? "font-medium text-text-primary" : "text-text-muted",
              )}
            >
              {etiqueta}
            </span>
            {indice < PASOS.length - 1 ? (
              <span aria-hidden="true" className="h-px w-6 bg-border" />
            ) : null}
          </li>
        ))}
      </ol>

      {/* PASO 1 — Archivo */}
      {paso === 0 ? (
        <div className="flex flex-col gap-4">
          <ZonaSubida
            alLeer={(f, resultado) => {
              setArchivo(f);
              setLectura(resultado);
              setMapeo(proponerMapeo(resultado.cabeceras));
              setPaso(1);
            }}
          />

          {mapeos.length > 0 ? (
            <p className="text-xs text-text-secondary">
              Tienes {mapeos.length} mapeo{mapeos.length === 1 ? "" : "s"} guardado
              {mapeos.length === 1 ? "" : "s"}. Podrás aplicarlo en el paso siguiente.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* PASO 2 — Mapeo */}
      {paso === 1 && lectura ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-text-primary">
              <span className="font-semibold">{archivo?.name}</span>
            </p>
            <p className="cifra mt-1 text-xs text-text-secondary">
              {formatearEntero(lectura.filas.length)} filas ·{" "}
              {lectura.cabeceras.length} columnas · separador «{lectura.separador}» ·{" "}
              {lectura.codificacion}
            </p>
            {lectura.truncado ? (
              <p className="mt-2 flex items-start gap-2 text-xs text-warning">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                El archivo tenía más filas del límite. Solo se han leído las primeras 5.000.
              </p>
            ) : null}
          </div>

          {/* Las 5 primeras filas, para confirmar que se ha leído bien. */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Primeras filas del archivo</caption>
              <thead>
                <tr className="border-b border-border bg-base text-left">
                  {lectura.cabeceras.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold text-text-muted">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lectura.filas.slice(0, 5).map((fila, indice) => (
                  <tr key={indice} className="border-b border-border last:border-b-0">
                    {lectura.cabeceras.map((c) => (
                      <td key={c} className="max-w-[180px] truncate px-3 py-2 text-text-secondary">
                        {fila[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mapeos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mapeo-guardado" className="text-sm font-medium text-text-primary">
                Aplicar un mapeo guardado
              </label>
              <select
                id="mapeo-guardado"
                onChange={(e) => {
                  const guardado = mapeos.find((m) => m.id === e.target.value);
                  if (guardado) setMapeo(guardado.config as Mapeo);
                }}
                className={CLASE_CAMPO}
                defaultValue=""
              >
                <option value="">Ninguno</option>
                {mapeos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                    {m.origen ? ` · ${m.origen}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Qué columna es cada campo
            </h2>

            {CAMPOS_DESTINO.map((campo) => (
              <div key={campo.valor} className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor={`mapeo-${campo.valor}`}
                  className="w-32 shrink-0 text-sm text-text-secondary"
                >
                  {campo.etiqueta}
                  {campo.obligatorio ? (
                    <span className="ml-1 text-danger" aria-label="obligatorio">*</span>
                  ) : null}
                </label>
                <select
                  id={`mapeo-${campo.valor}`}
                  value={mapeo[campo.valor] ?? ""}
                  onChange={(e) =>
                    setMapeo({ ...mapeo, [campo.valor]: e.target.value || undefined })
                  }
                  className={cn(CLASE_CAMPO, "min-w-0 flex-1")}
                >
                  <option value="">— sin asignar —</option>
                  {lectura.cabeceras.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}

            {sinAsignar.length > 0 ? (
              <p className="text-xs text-text-muted">
                Se van a ignorar {sinAsignar.length} columna
                {sinAsignar.length === 1 ? "" : "s"}: {sinAsignar.slice(0, 6).join(", ")}
                {sinAsignar.length > 6 ? "…" : ""}
              </p>
            ) : null}

            {!camposObligatoriosOk ? (
              <p role="alert" className="flex items-start gap-2 text-xs text-danger">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Fecha e importe son obligatorios: sin ellos no se puede crear un movimiento.
              </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                <label htmlFor="nombre-mapeo" className="text-xs text-text-secondary">
                  Guardar este mapeo como
                </label>
                <input
                  id="nombre-mapeo"
                  value={nombreMapeo}
                  onChange={(e) => setNombreMapeo(e.target.value)}
                  placeholder="Pedidos de Shopify"
                  className={CLASE_CAMPO}
                />
              </div>
              <button
                type="button"
                disabled={!nombreMapeo.trim() || !camposObligatoriosOk}
                onClick={async () => {
                  const resultado = await guardarMapeo({
                    nombre: nombreMapeo,
                    origen: lectura ? detectarOrigen(lectura.cabeceras) : null,
                    config: mapeo as Record<string, string | null>,
                  });
                  if (!resultado.ok) {
                    toast.error(resultado.error);
                    return;
                  }
                  toast.success("Mapeo guardado para la próxima vez.");
                  setNombreMapeo("");
                  router.refresh();
                }}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                Guardar mapeo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* PASO 3 — Agregación */}
      {paso === 2 ? (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <legend className="px-1 text-sm font-semibold text-text-primary">
              Cómo convertir las filas en movimientos
            </legend>

            {(
              [
                {
                  valor: "fila" as const,
                  titulo: "Una fila = un movimiento",
                  detalle: "Para extractos de gastos o facturas sueltas.",
                },
                {
                  valor: "dia" as const,
                  titulo: "Agrupar por día",
                  detalle:
                    "Para exports de pedidos: suma los importes de cada fecha y cuenta los pedidos, generando un movimiento diario.",
                },
              ]
            ).map((opcion) => (
              <label
                key={opcion.valor}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  agregacion === opcion.valor
                    ? "border-brand bg-brand-soft"
                    : "border-border hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="agregacion"
                  checked={agregacion === opcion.valor}
                  onChange={() => setAgregacion(opcion.valor)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">
                    {opcion.titulo}
                  </span>
                  <span className="block text-xs text-text-secondary">{opcion.detalle}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">Tipo</span>
              <SelectorSegmentado
                nombre="tipo-importacion"
                etiquetaGrupo="Tipo de movimiento"
                valor={tipo}
                opciones={[
                  { valor: "ingreso", etiqueta: "Ingreso" },
                  { valor: "gasto", etiqueta: "Gasto" },
                ]}
                alCambiar={(valor) => {
                  setTipo(valor);
                  setCategoriaId("");
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoria-importacion" className="text-sm font-medium text-text-primary">
                Categoría
              </label>
              <select
                id="categoria-importacion"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className={CLASE_CAMPO}
              >
                <option value="">Elige una categoría</option>
                {categoriasDelTipo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tasa-importacion" className="text-sm font-medium text-text-primary">
              Tasa de cambio para las filas en USD
            </label>
            <div className="max-w-[200px]">
              <CampoImporte id="tasa-importacion" valor={tasa} alCambiar={setTasa} />
            </div>
            <p className="text-xs text-text-secondary">
              Solo se usa en las filas cuya divisa sea USD. Las de euros no la tocan.
            </p>
          </div>

          <p className="cifra rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-secondary">
            Con este ajuste saldrían{" "}
            <span className="font-semibold text-text-primary">
              {formatearEntero(filasPreparadas.length)}
            </span>{" "}
            movimientos.
          </p>
        </div>
      ) : null}

      {/* PASO 4 — Revisión */}
      {paso === 3 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="cifra min-w-0 flex-1 text-sm text-text-primary">
              <span className="font-semibold text-success">
                {formatearEntero(resumen.listas.length)}
              </span>{" "}
              movimientos listos ·{" "}
              <span className="font-semibold text-warning">
                {formatearEntero(resumen.duplicadas)}
              </span>{" "}
              duplicados omitidos ·{" "}
              <span className="font-semibold text-danger">
                {formatearEntero(resumen.erroneas)}
              </span>{" "}
              con error
            </p>

            {resumen.duplicadas + resumen.erroneas > 0 ? (
              <button
                type="button"
                onClick={descargarRechazadas}
                className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2"
              >
                <Download aria-hidden="true" className="size-4" />
                Descargar rechazadas
              </button>
            ) : null}
          </div>

          <div className="max-h-[50dvh] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <caption className="sr-only">Filas que se van a importar</caption>
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-base text-left text-xs font-semibold tracking-wide text-text-muted uppercase">
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Incluir</span>
                  </th>
                  <th scope="col" className="px-3 py-2.5">Fecha</th>
                  <th scope="col" className="px-3 py-2.5">Concepto</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Importe</th>
                  <th scope="col" className="px-3 py-2.5">Divisa</th>
                  <th scope="col" className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {validadas.map((fila) => {
                  const excluida = excluidas.has(fila.indice);
                  const importable = fila.estado === "ok";

                  return (
                    <tr
                      key={fila.indice}
                      className={cn(
                        "border-b border-border last:border-b-0",
                        fila.estado === "error" && "bg-danger/10",
                        fila.estado === "duplicado" && "bg-warning/10",
                        excluida && "opacity-50",
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={importable && !excluida}
                          disabled={!importable}
                          onChange={() =>
                            setExcluidas((anterior) => {
                              const siguiente = new Set(anterior);
                              if (siguiente.has(fila.indice)) siguiente.delete(fila.indice);
                              else siguiente.add(fila.indice);
                              return siguiente;
                            })
                          }
                          aria-label={`Incluir la fila ${fila.indice + 1}`}
                          className="size-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="cifra px-3 py-2 whitespace-nowrap text-text-secondary">
                        {fila.fecha ? formatearFecha(fila.fecha) : "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-text-primary">
                        {fila.concepto || "—"}
                      </td>
                      <td className="cifra px-3 py-2 text-right text-text-secondary">
                        {fila.importe === null ? "—" : fila.importe.toFixed(2).replace(".", ",")}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{fila.divisa}</td>
                      <td className="px-3 py-2">
                        {fila.estado === "ok" ? (
                          <span className="text-xs text-success">Lista</span>
                        ) : (
                          <span
                            className={cn(
                              "text-xs",
                              fila.estado === "error" ? "text-danger" : "text-warning",
                            )}
                          >
                            {fila.motivo}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* PASO 5 — Confirmación */}
      {paso === 4 ? (
        <div className="flex flex-col gap-4">
          <dl className="overflow-hidden rounded-xl border border-border">
            {[
              { etiqueta: "Archivo", valor: archivo?.name ?? "—" },
              {
                etiqueta: "Movimientos a crear",
                valor: formatearEntero(resumen.listas.length),
              },
              { etiqueta: "Importe total", valor: formatearEuros(resumen.total) },
              {
                etiqueta: "Rango de fechas",
                valor:
                  resumen.desde && resumen.hasta
                    ? `${formatearFecha(resumen.desde)} – ${formatearFecha(resumen.hasta)}`
                    : "—",
              },
              {
                etiqueta: "Categoría",
                valor:
                  categorias.find((c) => c.id === categoriaId)?.nombre ?? "Sin elegir",
              },
              { etiqueta: "Tipo", valor: tipo === "ingreso" ? "Ingreso" : "Gasto" },
            ].map((fila) => (
              <div
                key={fila.etiqueta}
                className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <dt className="text-sm text-text-secondary">{fila.etiqueta}</dt>
                <dd className="cifra text-sm font-medium text-text-primary">{fila.valor}</dd>
              </div>
            ))}
          </dl>

          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm text-text-secondary">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              La importación entra entera o no entra. Si algo falla a mitad, no se
              queda ningún movimiento suelto. Después podrás deshacerla desde el
              historial mientras no entre en un cierre aprobado.
            </span>
          </p>
        </div>
      ) : null}

      {/* Navegación */}
      {paso > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setPaso(paso - 1)}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Atrás
          </button>

          {paso === 1 ? (
            <button
              type="button"
              disabled={!camposObligatoriosOk}
              onClick={() => setPaso(2)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              Continuar
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          ) : null}

          {paso === 2 ? (
            <button
              type="button"
              disabled={validando || filasPreparadas.length === 0}
              onClick={validar}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {validando ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Revisar las filas
            </button>
          ) : null}

          {paso === 3 ? (
            <button
              type="button"
              disabled={resumen.listas.length === 0}
              onClick={() => setPaso(4)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              Continuar
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          ) : null}

          {paso === 4 ? (
            <button
              type="button"
              disabled={importando || !categoriaId || resumen.listas.length === 0}
              onClick={importar}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {importando ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Importar {formatearEntero(resumen.listas.length)} movimientos
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
