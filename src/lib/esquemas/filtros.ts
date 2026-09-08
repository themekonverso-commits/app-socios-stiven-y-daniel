import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

/**
 * Filtros de /movimientos.
 *
 * Viven en la query string para que una vista filtrada se pueda guardar en
 * marcadores y compartir. Este archivo es la única traducción entre la URL y
 * el objeto de filtros; lo usan la página (servidor), la barra de filtros
 * (navegador) y la exportación a CSV.
 */

export const PRESETS_FECHA = [
  { valor: "este-mes", etiqueta: "Este mes" },
  { valor: "mes-anterior", etiqueta: "Mes anterior" },
  { valor: "ultimos-30", etiqueta: "Últimos 30 días" },
  { valor: "este-trimestre", etiqueta: "Este trimestre" },
  { valor: "este-ano", etiqueta: "Este año" },
  { valor: "personalizado", etiqueta: "Personalizado" },
] as const;

export type PresetFecha = (typeof PRESETS_FECHA)[number]["valor"];
export const PRESET_POR_DEFECTO: PresetFecha = "este-mes";

export type FiltroTipo = "todos" | "ingreso" | "gasto";
export type FiltroReembolso = "todos" | "pendiente" | "reembolsado";
export type CampoOrden = "fecha" | "concepto" | "total_eur";
export type DireccionOrden = "asc" | "desc";

export const FILAS_POR_PAGINA = 50;

export type Filtros = {
  preset: PresetFecha;
  desde: string;
  hasta: string;
  tipo: FiltroTipo;
  categorias: string[];
  anticipado: string;
  reembolso: FiltroReembolso;
  q: string;
  orden: CampoOrden;
  direccion: DireccionOrden;
  pagina: number;
};

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");

/** Rango de fechas de un preset, calculado con la fecha local de hoy. */
export function rangoDePreset(
  preset: PresetFecha,
  hoy = new Date(),
): { desde: string; hasta: string } {
  switch (preset) {
    case "mes-anterior": {
      const mesPasado = subMonths(hoy, 1);
      return {
        desde: iso(startOfMonth(mesPasado)),
        hasta: iso(endOfMonth(mesPasado)),
      };
    }
    case "ultimos-30":
      return { desde: iso(subDays(hoy, 29)), hasta: iso(hoy) };
    case "este-trimestre":
      return { desde: iso(startOfQuarter(hoy)), hasta: iso(endOfQuarter(hoy)) };
    case "este-ano":
      return { desde: iso(startOfYear(hoy)), hasta: iso(endOfYear(hoy)) };
    case "este-mes":
    case "personalizado":
    default:
      return { desde: iso(startOfMonth(hoy)), hasta: iso(endOfMonth(hoy)) };
  }
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

/** Query string → filtros, con valores por defecto sensatos y saneados. */
export function leerFiltros(
  params: Record<string, string | string[] | undefined>,
): Filtros {
  const presetBruto = texto(params.preset);
  const preset = PRESETS_FECHA.some((p) => p.valor === presetBruto)
    ? (presetBruto as PresetFecha)
    : PRESET_POR_DEFECTO;

  const desdeBruto = texto(params.desde);
  const hastaBruto = texto(params.hasta);

  let desde: string;
  let hasta: string;

  if (preset === "personalizado") {
    const rango = rangoDePreset("este-mes");
    desde = FECHA_ISO.test(desdeBruto) ? desdeBruto : rango.desde;
    hasta = FECHA_ISO.test(hastaBruto) ? hastaBruto : rango.hasta;
  } else {
    ({ desde, hasta } = rangoDePreset(preset));
  }

  // Un rango invertido no devolvería nada y parecería un fallo: se endereza.
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const tipoBruto = texto(params.tipo);
  const tipo: FiltroTipo =
    tipoBruto === "ingreso" || tipoBruto === "gasto" ? tipoBruto : "todos";

  const categoriasBrutas = params.categorias;
  const categorias = (
    Array.isArray(categoriasBrutas)
      ? categoriasBrutas
      : categoriasBrutas
        ? categoriasBrutas.split(",")
        : []
  )
    .map((valor) => valor.trim())
    .filter(Boolean);

  const reembolsoBruto = texto(params.reembolso);
  const reembolso: FiltroReembolso =
    reembolsoBruto === "pendiente" || reembolsoBruto === "reembolsado"
      ? reembolsoBruto
      : "todos";

  const ordenBruto = texto(params.orden);
  const orden: CampoOrden =
    ordenBruto === "concepto" || ordenBruto === "total_eur"
      ? ordenBruto
      : "fecha";

  const direccion: DireccionOrden =
    texto(params.direccion) === "asc" ? "asc" : "desc";

  const paginaBruta = Number.parseInt(texto(params.pagina), 10);
  const pagina =
    Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

  return {
    preset,
    desde,
    hasta,
    tipo,
    categorias,
    anticipado: texto(params.anticipado) || "todos",
    reembolso,
    q: texto(params.q).slice(0, 120),
    orden,
    direccion,
    pagina,
  };
}

/** Filtros → query string, omitiendo todo lo que ya es el valor por defecto. */
export function escribirFiltros(filtros: Partial<Filtros>): string {
  const params = new URLSearchParams();

  if (filtros.preset && filtros.preset !== PRESET_POR_DEFECTO) {
    params.set("preset", filtros.preset);
  }
  if (filtros.preset === "personalizado") {
    if (filtros.desde) params.set("desde", filtros.desde);
    if (filtros.hasta) params.set("hasta", filtros.hasta);
  }
  if (filtros.tipo && filtros.tipo !== "todos") params.set("tipo", filtros.tipo);
  if (filtros.categorias?.length) {
    params.set("categorias", filtros.categorias.join(","));
  }
  if (filtros.anticipado && filtros.anticipado !== "todos") {
    params.set("anticipado", filtros.anticipado);
  }
  if (filtros.reembolso && filtros.reembolso !== "todos") {
    params.set("reembolso", filtros.reembolso);
  }
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.orden && filtros.orden !== "fecha") params.set("orden", filtros.orden);
  if (filtros.direccion && filtros.direccion !== "desc") {
    params.set("direccion", filtros.direccion);
  }
  if (filtros.pagina && filtros.pagina > 1) {
    params.set("pagina", String(filtros.pagina));
  }

  return params.toString();
}

/** ¿Hay algún filtro distinto del estado por defecto? */
export function hayFiltrosActivos(filtros: Filtros): boolean {
  return (
    filtros.preset !== PRESET_POR_DEFECTO ||
    filtros.tipo !== "todos" ||
    filtros.categorias.length > 0 ||
    filtros.anticipado !== "todos" ||
    filtros.reembolso !== "todos" ||
    filtros.q !== ""
  );
}
