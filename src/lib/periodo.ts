import {
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

/**
 * Periodo global del dashboard y de /kpis.
 *
 * Vive en la query string para que una vista se pueda compartir y el botón
 * «atrás» funcione. Comparte los mismos nombres de preset que los filtros de
 * /movimientos, así que «Ver todos» puede arrastrar el periodo a esa pantalla.
 */

export const PRESETS_PERIODO = [
  { valor: "este-mes", etiqueta: "Este mes", comparativa: "vs. mes anterior" },
  { valor: "mes-anterior", etiqueta: "Mes anterior", comparativa: "vs. mes previo" },
  { valor: "ultimos-30", etiqueta: "Últimos 30 días", comparativa: "vs. 30 días previos" },
  { valor: "este-trimestre", etiqueta: "Este trimestre", comparativa: "vs. trimestre anterior" },
  { valor: "este-ano", etiqueta: "Este año", comparativa: "vs. año anterior" },
  { valor: "personalizado", etiqueta: "Personalizado", comparativa: "vs. periodo previo" },
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

export function rangoDePresetPeriodo(
  preset: PresetPeriodo,
  hoy = new Date(),
): { desde: string; hasta: string } {
  switch (preset) {
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
 * antes de que empiece la actual.
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

/** Por día hasta 30, por semana hasta 90, por mes a partir de ahí. */
export function agrupacionDePeriodo(periodo: Periodo): Agrupacion {
  const dias = diasDelPeriodo(periodo);
  if (dias <= 31) return "dia";
  if (dias <= 90) return "semana";
  return "mes";
}
