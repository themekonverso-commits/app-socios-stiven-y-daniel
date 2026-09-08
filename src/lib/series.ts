import { endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

import { redondear2 } from "@/lib/dinero";
import type { Agrupacion } from "@/lib/periodo";
import type { PuntoDiario } from "@/lib/consultas-kpi";

/**
 * Agrupación temporal de las series.
 *
 * Funciones puras, sin acceso a red: se ejecutan en el servidor y el gráfico
 * recibe los puntos ya listos. Así el componente de cliente no calcula nada.
 */

export type PuntoSerie = {
  /** Clave estable del punto (fecha ISO del inicio del tramo). */
  clave: string;
  /** Etiqueta corta para el eje X. */
  etiqueta: string;
  /** Etiqueta larga para el tooltip. */
  etiquetaLarga: string;
  ingresos: number;
  gastos: number;
  beneficio: number;
  pedidos: number;
  gastoAds: number;
};

function nuevoPunto(clave: string, etiqueta: string, etiquetaLarga: string): PuntoSerie {
  return {
    clave,
    etiqueta,
    etiquetaLarga,
    ingresos: 0,
    gastos: 0,
    beneficio: 0,
    pedidos: 0,
    gastoAds: 0,
  };
}

/**
 * Agrupa la serie diaria por día, semana o mes.
 *
 * Los días sin movimientos se rellenan con ceros cuando la agrupación es
 * diaria: un hueco en el eje temporal se lee como «no pasó nada», que es
 * verdad, mientras que saltarse el día deforma la línea.
 */
export function agruparSerie(
  dias: PuntoDiario[],
  agrupacion: Agrupacion,
  rango: { desde: string; hasta: string },
): PuntoSerie[] {
  const puntos = new Map<string, PuntoSerie>();

  const claveDe = (fechaIso: string): { clave: string; corta: string; larga: string } => {
    const fecha = parseISO(fechaIso);

    if (agrupacion === "dia") {
      return {
        clave: fechaIso,
        corta: format(fecha, "d MMM", { locale: es }),
        larga: format(fecha, "EEEE d 'de' MMMM", { locale: es }),
      };
    }

    if (agrupacion === "semana") {
      const inicio = startOfWeek(fecha, { weekStartsOn: 1 });
      const fin = endOfWeek(fecha, { weekStartsOn: 1 });
      return {
        clave: format(inicio, "yyyy-MM-dd"),
        corta: format(inicio, "d MMM", { locale: es }),
        larga: `Semana del ${format(inicio, "d MMM", { locale: es })} al ${format(fin, "d MMM", { locale: es })}`,
      };
    }

    return {
      clave: format(fecha, "yyyy-MM-01"),
      corta: format(fecha, "MMM yy", { locale: es }),
      larga: format(fecha, "MMMM 'de' yyyy", { locale: es }),
    };
  };

  // Con agrupación diaria se siembran todos los días del rango.
  if (agrupacion === "dia") {
    const desde = parseISO(rango.desde);
    const hasta = parseISO(rango.hasta);
    for (
      let fecha = new Date(desde);
      fecha <= hasta;
      fecha.setDate(fecha.getDate() + 1)
    ) {
      const iso = format(fecha, "yyyy-MM-dd");
      const { clave, corta, larga } = claveDe(iso);
      puntos.set(clave, nuevoPunto(clave, corta, larga));
    }
  }

  for (const dia of dias) {
    if (!dia.fecha) continue;
    const { clave, corta, larga } = claveDe(dia.fecha);
    const punto = puntos.get(clave) ?? nuevoPunto(clave, corta, larga);

    punto.ingresos = redondear2(punto.ingresos + dia.ingresos);
    punto.gastos = redondear2(punto.gastos + dia.gastos);
    punto.beneficio = redondear2(punto.beneficio + dia.beneficio);
    punto.pedidos += dia.pedidos;
    punto.gastoAds = redondear2(punto.gastoAds + dia.gastoAds);

    puntos.set(clave, punto);
  }

  return [...puntos.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}

/**
 * Reduce las categorías a un máximo, agrupando la cola en «Otros».
 * Un anillo con quince porciones no comunica nada.
 */
export function agruparCola<T extends { categoria: string; total: number }>(
  filas: T[],
  maximo = 6,
): { categoria: string; total: number; esOtros: boolean }[] {
  const ordenadas = [...filas].sort((a, b) => b.total - a.total);

  if (ordenadas.length <= maximo) {
    return ordenadas.map((f) => ({
      categoria: f.categoria,
      total: redondear2(f.total),
      esOtros: false,
    }));
  }

  const principales = ordenadas.slice(0, maximo - 1);
  const resto = ordenadas.slice(maximo - 1);
  const totalResto = resto.reduce((suma, f) => suma + f.total, 0);

  return [
    ...principales.map((f) => ({
      categoria: f.categoria,
      total: redondear2(f.total),
      esOtros: false,
    })),
    {
      categoria: `Otros (${resto.length})`,
      total: redondear2(totalResto),
      esOtros: true,
    },
  ];
}
