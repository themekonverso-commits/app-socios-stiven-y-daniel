import {
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

/**
 * Periodo global del dashboard y de /kpis.
 *
 * Vive en la query string para que una vista se pueda compartir y el botón
 * «atrás» funcione. Comparte los mismos nombres de preset que los filtros de
 * /movimientos, así que «Ver todos» puede arrastrar el periodo a esa pantalla.
 */

/**
 * De menor a mayor rango. `grupo` separa visualmente los bloques del
 * desplegable: una lista de once opciones seguidas no se lee.
 */
export const PRESETS_PERIODO = [
  { valor: "hoy", etiqueta: "Hoy", comparativa: "vs. ayer", grupo: "dias" },
  { valor: "ayer", etiqueta: "Ayer", comparativa: "vs. anteayer", grupo: "dias" },
  { valor: "esta-semana", etiqueta: "Esta semana", comparativa: "vs. semana pasada", grupo: "semanas" },
  { valor: "semana-pasada", etiqueta: "Semana pasada", comparativa: "vs. semana previa", grupo: "semanas" },
  { valor: "ultimos-7", etiqueta: "Últimos 7 días", comparativa: "vs. 7 días previos", grupo: "moviles" },
  { valor: "ultimos-15", etiqueta: "Últimos 15 días", comparativa: "vs. 15 días previos", grupo: "moviles" },
  { valor: "ultimos-30", etiqueta: "Últimos 30 días", comparativa: "vs. 30 días previos", grupo: "moviles" },
  { valor: "este-mes", etiqueta: "Este mes", comparativa: "vs. mes anterior", grupo: "meses" },
  { valor: "mes-anterior", etiqueta: "Mes anterior", comparativa: "vs. mes previo", grupo: "meses" },
  { valor: "este-trimestre", etiqueta: "Este trimestre", comparativa: "vs. trimestre anterior", grupo: "largo" },
  { valor: "este-ano", etiqueta: "Este año", comparativa: "vs. año anterior", grupo: "largo" },
  { valor: "personalizado", etiqueta: "Personalizado", comparativa: "vs. periodo previo", grupo: "personalizado" },
] as const;

export type PresetPeriodo = (typeof PRESETS_PERIODO)[number]["valor"];
export const PRESET_PERIODO_DEFECTO: PresetPeriodo = "este-mes";

export type Periodo = {
  preset: PresetPeriodo;
  desde: string;
  hasta: string;
  /** Texto de la comparación: «vs. mes anterior». */
  comparativa: string;
};

/** Granularidad del eje temporal según lo largo que sea el periodo. */
export type Agrupacion = "dia" | "semana" | "mes";

const iso = (fecha: Date) => format(fecha, "yyyy-MM-dd");
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La fecha de hoy en España, a medianoche local.
 *
 * El servidor de Vercel corre en UTC: con `new Date()` a secas, entre las
 * 00:00 y las 02:00 de Madrid «Hoy» seguiría siendo ayer.
 */
export function hoyEnEspana(): Date {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  return parseISO(hoy);
}

/** Semana natural: de lunes a domingo. */
const SEMANA = { weekStartsOn: 1 } as const;

export function rangoDePresetPeriodo(
  preset: PresetPeriodo,
  hoy = hoyEnEspana(),
): { desde: string; hasta: string } {
  switch (preset) {
    case "hoy":
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "ayer": {
      const ayer = subDays(hoy, 1);
      return { desde: iso(ayer), hasta: iso(ayer) };
    }
    case "esta-semana":
      return { desde: iso(startOfWeek(hoy, SEMANA)), hasta: iso(endOfWeek(hoy, SEMANA)) };
    case "semana-pasada": {
      const pasada = subWeeks(hoy, 1);
      return { desde: iso(startOfWeek(pasada, SEMANA)), hasta: iso(endOfWeek(pasada, SEMANA)) };
    }
    case "ultimos-7":
      return { desde: iso(subDays(hoy, 6)), hasta: iso(hoy) };
    case "ultimos-15":
      return { desde: iso(subDays(hoy, 14)), hasta: iso(hoy) };
    case "mes-anterior": {
      const anterior = subMonths(hoy, 1);
      return { desde: iso(startOfMonth(anterior)), hasta: iso(endOfMonth(anterior)) };
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

function texto(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

/** Query string → periodo, saneado. */
export function leerPeriodo(
  params: Record<string, string | string[] | undefined>,
): Periodo {
  const bruto = texto(params.periodo);
  const preset = PRESETS_PERIODO.some((p) => p.valor === bruto)
    ? (bruto as PresetPeriodo)
    : PRESET_PERIODO_DEFECTO;

  let desde: string;
  let hasta: string;

  if (preset === "personalizado") {
    const rango = rangoDePresetPeriodo("este-mes");
    const d = texto(params.desde);
    const h = texto(params.hasta);
    desde = FECHA_ISO.test(d) ? d : rango.desde;
    hasta = FECHA_ISO.test(h) ? h : rango.hasta;
  } else {
    ({ desde, hasta } = rangoDePresetPeriodo(preset));
  }

  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const comparativa =
    PRESETS_PERIODO.find((p) => p.valor === preset)?.comparativa ??
    "vs. periodo previo";

  return { preset, desde, hasta, comparativa };
}

/** Periodo → query string, omitiendo lo que ya es el valor por defecto. */
export function escribirPeriodo(periodo: Periodo): string {
  const params = new URLSearchParams();
  if (periodo.preset !== PRESET_PERIODO_DEFECTO) {
    params.set("periodo", periodo.preset);
  }
  if (periodo.preset === "personalizado") {
    params.set("desde", periodo.desde);
    params.set("hasta", periodo.hasta);
  }
  return params.toString();
}

/**
 * El periodo inmediatamente anterior, de la MISMA duración.
 *
 * Comparar un mes en curso contra un mes completo daría caídas fantasma, así
 * que la ventana anterior mide exactamente los mismos días y termina justo
 * antes de que empiece la actual. Así «Hoy» compara con ayer, «Ayer» con
 * anteayer, «Esta semana» con la semana pasada y «Últimos 7 días» con los 7
 * anteriores.
 */
export function periodoAnterior(periodo: Periodo): { desde: string; hasta: string } {
  const desde = parseISO(periodo.desde);
  const hasta = parseISO(periodo.hasta);
  const dias = differenceInCalendarDays(hasta, desde) + 1;

  return {
    desde: iso(subDays(desde, dias)),
    hasta: iso(subDays(hasta, dias)),
  };
}

/** Días naturales que cubre el periodo. */
export function diasDelPeriodo(periodo: Periodo): number {
  return differenceInCalendarDays(parseISO(periodo.hasta), parseISO(periodo.desde)) + 1;
}

/**
 * Por día hasta 31, por semana hasta 90, por mes a partir de ahí.
 *
 * «Hoy» y «Ayer» no bajan a horas: `movimientos.fecha` es una fecha sin
 * hora, y la única hora guardada (`created_at`) dice cuándo se anotó, no
 * cuándo se vendió. Se queda en un solo tramo diario.
 */
export function agrupacionDePeriodo(periodo: Periodo): Agrupacion {
  const dias = diasDelPeriodo(periodo);
  if (dias <= 31) return "dia";
  if (dias <= 90) return "semana";
  return "mes";
}
