import { Suspense } from "react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { BotonNuevoMovimiento } from "@/components/movimientos/boton-nuevo-movimiento";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import { TarjetasKpi } from "@/components/dashboard/tarjetas-kpi";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { RendimientoPublicidad } from "@/components/dashboard/rendimiento-publicidad";
import { ProximasRenovaciones } from "@/components/dashboard/proximas-renovaciones";
import { UltimosMovimientos } from "@/components/dashboard/ultimos-movimientos";
import {
  EsqueletoBloque,
  EsqueletoTarjetas,
} from "@/components/dashboard/esqueletos";
import {
  GraficoEvolucion,
  TablaEvolucion,
} from "@/components/graficos/grafico-evolucion";
import { GraficoGastosCategoria } from "@/components/graficos/grafico-gastos-categoria";
import {
  obtenerGastoPorPlataforma,
  obtenerGastosPorCategoria,
  obtenerResumen,
  obtenerResumenComparado,
  obtenerSaldoCaja,
  obtenerSerieDiaria,
  obtenerUltimosMovimientos,
} from "@/lib/consultas-kpi";
import { obtenerProximasRenovaciones } from "@/lib/consultas-cuentas";
import {
  agrupacionDePeriodo,
  diasDelPeriodo,
  escribirPeriodo,
  leerPeriodo,
  type Periodo,
} from "@/lib/periodo";
import { agruparCola, agruparSerie } from "@/lib/series";

export const metadata = { title: "Dashboard" };

/** Los datos del dashboard se refrescan cada minuto. */
export const revalidate = 60;

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const clave = JSON.stringify(params);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Resumen"
        descripcion="Cómo va el negocio en el periodo seleccionado."
        acciones={
          <div className="flex flex-wrap gap-2">
            <SelectorPeriodo periodo={periodo} />
            <BotonNuevoMovimiento />
          </div>
        }
      />

      {/* Cada bloque tiene su propio Suspense: las tarjetas aparecen sin
          esperar a que terminen de calcularse los gráficos. */}
      <Suspense key={`kpi-${clave}`} fallback={<EsqueletoTarjetas />}>
        <BloqueKpis periodo={periodo} />
      </Suspense>

      <Suspense key={`graficos-${clave}`} fallback={<EsqueletoBloque alto={380} />}>
        <BloqueGraficos periodo={periodo} />
      </Suspense>

      <Suspense key={`ads-${clave}`} fallback={<EsqueletoBloque alto={420} />}>
        <BloquePublicidad periodo={periodo} />
      </Suspense>

      <Suspense key={`ultimos-${clave}`} fallback={<EsqueletoBloque alto={320} />}>
        <BloqueUltimos periodo={periodo} />
      </Suspense>
    </div>
  );
}

async function BloqueKpis({ periodo }: { periodo: Periodo }) {
  const [{ actual, anterior, hayAnterior }, saldo] = await Promise.all([
    obtenerResumenComparado(periodo),
    obtenerSaldoCaja(),
  ]);

  return (
    <TarjetasKpi
      periodo={periodo}
      actual={actual}
      anterior={anterior}
      hayAnterior={hayAnterior}
      saldo={saldo}
    />
  );
}

async function BloqueGraficos({ periodo }: { periodo: Periodo }) {
  const [dias, gastos] = await Promise.all([
    obtenerSerieDiaria(periodo.desde, periodo.hasta),
    obtenerGastosPorCategoria(periodo.desde, periodo.hasta),
  ]);

  const puntos = agruparSerie(dias, agrupacionDePeriodo(periodo), periodo);
  const porciones = agruparCola(gastos, 6);
  const totalGastos = porciones.reduce((suma, p) => suma + p.total, 0);

  const agrupacion = agrupacionDePeriodo(periodo);
  const descripcion =
    agrupacion === "dia"
      ? "Agrupado por día."
      : agrupacion === "semana"
        ? "Agrupado por semana."
        : "Agrupado por mes.";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TarjetaBloque
        titulo="Evolución"
        descripcion={descripcion}
        className="lg:col-span-2"
      >
        <GraficoEvolucion puntos={puntos} />
        <TablaEvolucion puntos={puntos} />
      </TarjetaBloque>

      <TarjetaBloque titulo="Desglose de gastos" descripcion="Por categoría.">
        <GraficoGastosCategoria
          porciones={porciones}
          total={Math.round(totalGastos * 100) / 100}
        />
      </TarjetaBloque>
    </div>
  );
}

async function BloquePublicidad({ periodo }: { periodo: Periodo }) {
  const resumen = await obtenerResumen(periodo.desde, periodo.hasta);

  // Sin inversión publicitaria, el bloque entero sobra.
  if (resumen.gastoAds === 0) return null;

  const [dias, plataformas] = await Promise.all([
    obtenerSerieDiaria(periodo.desde, periodo.hasta),
    obtenerGastoPorPlataforma(periodo.desde, periodo.hasta),
  ]);

  const puntos = agruparSerie(dias, agrupacionDePeriodo(periodo), periodo);

  return (
    <RendimientoPublicidad
      puntos={puntos}
      resumen={resumen}
      plataformas={plataformas}
      dias={diasDelPeriodo(periodo)}
    />
  );
}

async function BloqueUltimos({ periodo }: { periodo: Periodo }) {
  const [movimientos, renovaciones] = await Promise.all([
    obtenerUltimosMovimientos(periodo.desde, periodo.hasta, 8),
    obtenerProximasRenovaciones(3),
  ]);

  // El periodo viaja a /movimientos para no perder el contexto al saltar.
  const query = escribirPeriodo(periodo);
  const enlace = query
    ? `/movimientos?preset=personalizado&desde=${periodo.desde}&hasta=${periodo.hasta}`
    : "/movimientos";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <UltimosMovimientos movimientos={movimientos} enlaceVerTodos={enlace} />
      </div>
      <ProximasRenovaciones cuentas={renovaciones} />
    </div>
  );
}
