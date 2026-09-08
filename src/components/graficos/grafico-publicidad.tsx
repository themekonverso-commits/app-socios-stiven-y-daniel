"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { GraficoVacio } from "@/components/graficos/grafico-vacio";
import { TooltipGrafico } from "@/components/graficos/tooltip-grafico";
import { COLOR, EJE, REJILLA } from "@/components/graficos/tema";
import type { PuntoSerie } from "@/lib/series";

function ejeEuros(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `${(valor / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k`;
  }
  return valor.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

/**
 * Gasto publicitario frente a facturación, en dos ejes.
 *
 * Dos ejes porque las escalas no son comparables: si la facturación multiplica
 * por diez al gasto, la línea del gasto quedaría pegada al suelo y no se vería
 * si sube o baja.
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
export function GraficoPublicidad({ puntos }: { puntos: PuntoSerie[] }) {

  const hayDatos = puntos.some((p) => p.gastoAds !== 0 || p.ingresos !== 0);
  if (!hayDatos) {
    return <GraficoVacio mensaje="No hay inversión publicitaria en este periodo." />;
  }

  const intervalo =
    puntos.length <= 8 ? 0 : Math.max(0, Math.ceil(puntos.length / 7) - 1);

  return (
    <ResponsiveContainer width="100%" height={260} minHeight={240}>
      <LineChart data={puntos} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
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
          yAxisId="ads"
          stroke={EJE.stroke}
          fontSize={EJE.fontSize}
          tickLine={EJE.tickLine}
          axisLine={EJE.axisLine}
          tickFormatter={ejeEuros}
          width={48}
        />
        <YAxis
          yAxisId="ventas"
          orientation="right"
          stroke={EJE.stroke}
          fontSize={EJE.fontSize}
          tickLine={EJE.tickLine}
          axisLine={EJE.axisLine}
          tickFormatter={ejeEuros}
          width={48}
        />

        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const punto = payload[0]?.payload as PuntoSerie | undefined;
            if (!punto) return null;

            return (
              <TooltipGrafico
                titulo={punto.etiquetaLarga}
                filas={[
                  { nombre: "Gasto ads", valor: punto.gastoAds, color: COLOR.peligro },
                  { nombre: "Facturación", valor: punto.ingresos, color: COLOR.marca },
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

        <Line
          yAxisId="ads"
          type="monotone"
          dataKey="gastoAds"
          name="Gasto ads"
          stroke={COLOR.peligro}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          yAxisId="ventas"
          type="monotone"
          dataKey="ingresos"
          name="Facturación"
          stroke={COLOR.marca}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
