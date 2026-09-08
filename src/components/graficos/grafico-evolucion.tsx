"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { GraficoVacio } from "@/components/graficos/grafico-vacio";
import { TooltipGrafico } from "@/components/graficos/tooltip-grafico";
import { COLOR, EJE, REJILLA } from "@/components/graficos/tema";
import { formatearEuros } from "@/lib/formato";
import type { PuntoSerie } from "@/lib/series";

/** Euros abreviados para el eje Y: 12.400 → «12,4k». */
function ejeEuros(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `${(valor / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k`;
  }
  return valor.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

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
export function GraficoEvolucion({ puntos }: { puntos: PuntoSerie[] }) {

  const hayDatos = puntos.some(
    (p) => p.ingresos !== 0 || p.gastos !== 0 || p.beneficio !== 0,
  );

  /**
   * En móvil no caben todas las etiquetas del eje X. En vez de girarlas en
   * diagonal —que se leen fatal— se muestran una de cada N.
   */
  const intervalo = useMemo(() => {
    if (puntos.length <= 8) return 0;
    return Math.max(0, Math.ceil(puntos.length / 7) - 1);
  }, [puntos.length]);

  if (!hayDatos) {
    return (
      <GraficoVacio
        mensaje="Todavía no hay ingresos ni gastos en este periodo."
        sugerencia="Prueba a ampliar el rango o registra un movimiento."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280} minHeight={240}>
      <ComposedChart
        data={puntos}
        margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
      >
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
          interval={intervalo}
          minTickGap={8}
        />
        <YAxis
          stroke={EJE.stroke}
          fontSize={EJE.fontSize}
          tickLine={EJE.tickLine}
          axisLine={EJE.axisLine}
          tickFormatter={ejeEuros}
          width={52}
        />

        <Tooltip
          cursor={{ fill: "var(--bg-surface-2)", fillOpacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const punto = payload[0]?.payload as PuntoSerie | undefined;
            if (!punto) return null;

            return (
              <TooltipGrafico
                titulo={punto.etiquetaLarga}
                filas={[
                  { nombre: "Ingresos", valor: punto.ingresos, color: COLOR.marca },
                  { nombre: "Gastos", valor: punto.gastos, color: COLOR.peligro },
                  { nombre: "Beneficio", valor: punto.beneficio, color: COLOR.exito },
                ]}
              />
            );
          }}
        />

        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
        />

        <Bar
          dataKey="ingresos"
          name="Ingresos"
          fill={COLOR.marca}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Bar
          dataKey="gastos"
          name="Gastos"
          fill={COLOR.peligro}
          fillOpacity={0.6}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="beneficio"
          name="Beneficio"
          stroke={COLOR.exito}
          strokeWidth={2}
          dot={{ r: 3, fill: COLOR.exito, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Tabla alternativa para lectores de pantalla: el gráfico solo no basta. */
export function TablaEvolucion({ puntos }: { puntos: PuntoSerie[] }) {
  return (
    <table className="sr-only">
      <caption>Evolución de ingresos, gastos y beneficio</caption>
      <thead>
        <tr>
          <th scope="col">Periodo</th>
          <th scope="col">Ingresos</th>
          <th scope="col">Gastos</th>
          <th scope="col">Beneficio</th>
        </tr>
      </thead>
      <tbody>
        {puntos.map((punto) => (
          <tr key={punto.clave}>
            <th scope="row">{punto.etiquetaLarga}</th>
            <td>{formatearEuros(punto.ingresos)}</td>
            <td>{formatearEuros(punto.gastos)}</td>
            <td>{formatearEuros(punto.beneficio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
