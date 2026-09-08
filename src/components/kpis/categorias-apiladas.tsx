"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { GraficoVacio } from "@/components/graficos/grafico-vacio";
import { TooltipGrafico } from "@/components/graficos/tooltip-grafico";
import {
  COLOR_OTROS,
  EJE,
  PALETA_CATEGORIAS,
  REJILLA,
} from "@/components/graficos/tema";
import { Switch } from "@/components/ui/switch";
import { redondear2 } from "@/lib/dinero";
import { redondear1 } from "@/lib/kpis";
import type { GastoCategoriaMes } from "@/lib/consultas-kpi";

type FilaGrafico = Record<string, string | number>;

/**
 * Gastos por categoría, apilados por mes.
 *
 * El interruptor de porcentaje no es un adorno: en valores absolutos, un mes
 * de mucha facturación tapa el hecho de que una partida esté ganando peso.
 */
/*
 * Sin animaciones de entrada en los gráficos, a propósito.
 *
 * Recharts anima de un estado vacío al final. Ese primer fotograma vacío se ve
 * en un panel que se mira de pasada, y en el anillo llegaba a quedarse así para
 * siempre: el hook que leía `prefers-reduced-motion` se resolvía DESPUÉS del
 * montaje y ese segundo render reiniciaba la animación dejando los sectores sin
 * dibujar. Se comprobó en el navegador: los grupos existían y estaban vacíos.
 *
 * Renderizar directamente el estado final elimina el problema de raíz y cumple
 * `prefers-reduced-motion` por definición. Las transiciones de la interfaz que
 * sí animan siguen respetando la preferencia desde globals.css.
 */
export function CategoriasApiladas({ datos }: { datos: GastoCategoriaMes[] }) {
  const [enPorcentaje, setEnPorcentaje] = useState(false);

  const { filas, categorias } = useMemo(() => {
    // Se quedan las 5 categorías con más gasto acumulado; el resto va a «Otros».
    const totalPorCategoria = new Map<string, number>();
    for (const fila of datos) {
      totalPorCategoria.set(
        fila.categoria,
        (totalPorCategoria.get(fila.categoria) ?? 0) + fila.total,
      );
    }

    const principales = [...totalPorCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre]) => nombre);

    const hayOtros = totalPorCategoria.size > principales.length;
    const nombres = hayOtros ? [...principales, "Otros"] : principales;

    const porMes = new Map<string, FilaGrafico>();
    for (const fila of datos) {
      const clave = fila.mes;
      const actual =
        porMes.get(clave) ??
        ({
          mes: clave,
          etiqueta: clave ? format(parseISO(clave), "MMM yy", { locale: es }) : "",
          etiquetaLarga: clave
            ? format(parseISO(clave), "MMMM 'de' yyyy", { locale: es })
            : "",
        } as FilaGrafico);

      const nombre = principales.includes(fila.categoria) ? fila.categoria : "Otros";
      actual[nombre] = redondear2(Number(actual[nombre] ?? 0) + fila.total);
      porMes.set(clave, actual);
    }

    let resultado = [...porMes.values()].sort((a, b) =>
      String(a.mes).localeCompare(String(b.mes)),
    );

    if (enPorcentaje) {
      resultado = resultado.map((fila) => {
        const total = nombres.reduce((suma, n) => suma + Number(fila[n] ?? 0), 0);
        if (total === 0) return fila;
        const convertida: FilaGrafico = {
          mes: fila.mes,
          etiqueta: fila.etiqueta,
          etiquetaLarga: fila.etiquetaLarga,
        };
        for (const nombre of nombres) {
          convertida[nombre] = redondear1((Number(fila[nombre] ?? 0) / total) * 100);
        }
        return convertida;
      });
    }

    return { filas: resultado, categorias: nombres };
  }, [datos, enPorcentaje]);

  const colorDe = (nombre: string, indice: number) =>
    nombre === "Otros"
      ? COLOR_OTROS
      : PALETA_CATEGORIAS[indice % PALETA_CATEGORIAS.length]!;

  if (filas.length === 0) {
    return <GraficoVacio mensaje="No hay gastos registrados todavía." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center justify-end gap-2 text-xs text-text-secondary">
        <Switch checked={enPorcentaje} onCheckedChange={setEnPorcentaje} />
        Ver como porcentaje del total
      </label>

      <ResponsiveContainer width="100%" height={300} minHeight={240}>
        <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid
            stroke={REJILLA.stroke}
            strokeOpacity={REJILLA.strokeOpacity}
            vertical={REJILLA.vertical}
          />
          <XAxis
            dataKey="etiqueta"
            stroke={EJE.stroke}
            fontSize={EJE.fontSize}
            tickLine={EJE.tickLine}
            axisLine={EJE.axisLine}
            minTickGap={8}
          />
          <YAxis
            stroke={EJE.stroke}
            fontSize={EJE.fontSize}
            tickLine={EJE.tickLine}
            axisLine={EJE.axisLine}
            width={52}
            tickFormatter={(valor: number) =>
              enPorcentaje
                ? `${valor}%`
                : Math.abs(valor) >= 1000
                  ? `${(valor / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k`
                  : String(valor)
            }
          />

          <Tooltip
            cursor={{ fill: "var(--bg-surface-2)", fillOpacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0]?.payload as FilaGrafico | undefined;
              if (!fila) return null;

              return (
                <TooltipGrafico
                  titulo={String(fila.etiquetaLarga)}
                  filas={payload.map((entrada, indice) => ({
                    nombre: String(entrada.name),
                    valor: Number(entrada.value ?? 0),
                    color: colorDe(String(entrada.name), indice),
                    formato: enPorcentaje ? "entero" : "euros",
                  }))}
                />
              );
            }}
          />

          <Legend
            verticalAlign="top"
            align="left"
            height={32}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
          />

          {categorias.map((nombre, indice) => (
            <Bar
              key={nombre}
              dataKey={nombre}
              name={nombre}
              stackId="gastos"
              fill={colorDe(nombre, indice)}
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
