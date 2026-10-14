import { Suspense } from "react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { BotonNuevoMovimiento } from "@/components/movimientos/boton-nuevo-movimiento";
import { WidgetTarjeta } from "@/components/tarjeta/widget-tarjeta";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import {
  TarjetaCaja,
  TarjetasKpi,
  TarjetasKpiGeneral,
} from "@/components/dashboard/tarjetas-kpi";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { RendimientoPublicidad } from "@/components/dashboard/rendimiento-publicidad";
import { ProximasRenovaciones } from "@/components/dashboard/proximas-renovaciones";
import { UltimosMovimientos } from "@/components/dashboard/ultimos-movimientos";
import { TablaComparativa } from "@/components/dashboard/tabla-comparativa";
import { InterruptorReparto } from "@/components/dashboard/interruptor-reparto";
import { NotaReparto } from "@/components/dashboard/nota-reparto";
import {
  AvisoSinDiario,
  GeneralVacio,
  TiendaVacia,
} from "@/components/dashboard/estados-vacios";
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
  hayMovimientos,
  obtenerBeneficioAcumulado,
  obtenerComparativaTiendas,
  obtenerGastoPorPlataforma,
  obtenerGastosPorCategoria,
  obtenerResumen,
  obtenerResumenComparado,
  obtenerTesoreria,
  obtenerSerieDiaria,
  obtenerUltimaVenta,
  obtenerUltimosMovimientos,
} from "@/lib/consultas-kpi";
import { obtenerProximasRenovaciones } from "@/lib/consultas-cuentas";
import { obtenerCupoTarjeta } from "@/lib/consultas-cupo";
import { obtenerAmbito, obtenerTiendas } from "@/lib/tiendas";
import { SLUG_TODAS, conTienda, type Ambito } from "@/lib/ambito";
import { PARAM_REPARTO, aplicarReparto, calcularReparto } from "@/lib/kpis";
import {
  agrupacionDePeriodo,
  diasDelPeriodo,
  escribirPeriodo,
  leerPeriodo,
  periodoAnterior,
  type Periodo,
} from "@/lib/periodo";
import { agruparCola, agruparSerie } from "@/lib/series";

export const metadata = { title: "Dashboard" };

/** Los datos del dashboard se refrescan cada minuto. */
export const revalidate = 60;

type Params = Promise<Record<string, string | string[] | undefined>>;

/** «Todas las tiendas + General»: para lo que se mide contra el total. */
const TODAS: Ambito = { tipo: "todas", slug: SLUG_TODAS };

const DESCRIPCION: Record<Ambito["tipo"], string> = {
  tienda: "Cómo va la tienda en el periodo seleccionado.",
  todas: "Todas las tiendas y los gastos compartidos, sumados.",
  general: "Los gastos compartidos de la sociedad: lo que no es de ninguna tienda.",
};

export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const ambito = await obtenerAmbito();
  const conDatos = await hayMovimientos(ambito);

  // El reparto de General solo tiene sentido dentro de una tienda concreta.
  const reparto = ambito.tipo === "tienda" && params[PARAM_REPARTO] === "1";
  const clave = `${ambito.slug}-${JSON.stringify(params)}`;

  const encabezado = (
    <EncabezadoPagina
      titulo="Resumen"
      descripcion={DESCRIPCION[ambito.tipo]}
      acciones={
        <div className="flex flex-wrap gap-2">
          <SelectorPeriodo periodo={periodo} />
          <BotonNuevoMovimiento />
        </div>
      }
    />
  );

  // Tienda nueva (o General sin gastos): una invitación a empezar en lugar
  // de un dashboard lleno de ceros. La caja y la tarjeta se ven igual: son
  // de la sociedad.
  if (!conDatos && ambito.tipo !== "todas") {
    return (
      <div className="flex flex-col gap-5">
        {encabezado}
        {ambito.tipo === "tienda" ? (
          <TiendaVacia nombre={ambito.tienda.nombre} slug={ambito.slug} />
        ) : (
          <GeneralVacio />
        )}
        <Suspense key={`global-${clave}`} fallback={<EsqueletoBloque alto={320} />}>
          <BloqueSociedad ambito={ambito} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {encabezado}

      {ambito.tipo === "tienda" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <InterruptorReparto activo={reparto} />
        </div>
      ) : null}

      {/* Cada bloque tiene su propio Suspense: las tarjetas aparecen sin
          esperar a que terminen de calcularse los gráficos. */}
      <Suspense key={`kpi-${clave}`} fallback={<EsqueletoTarjetas />}>
        <BloqueKpis periodo={periodo} ambito={ambito} reparto={reparto} />
      </Suspense>

      {ambito.tipo === "todas" ? (
        <Suspense key={`comparativa-${clave}`} fallback={<EsqueletoBloque alto={240} />}>
          <BloqueComparativa periodo={periodo} />
        </Suspense>
      ) : null}

      <Suspense key={`graficos-${clave}`} fallback={<EsqueletoBloque alto={380} />}>
        <BloqueGraficos periodo={periodo} ambito={ambito} />
      </Suspense>

      <Suspense key={`ads-${clave}`} fallback={<EsqueletoBloque alto={420} />}>
        <BloquePublicidad periodo={periodo} ambito={ambito} />
      </Suspense>

      <Suspense key={`ultimos-${clave}`} fallback={<EsqueletoBloque alto={320} />}>
        <BloqueUltimos periodo={periodo} ambito={ambito} />
      </Suspense>
    </div>
  );
}

async function BloqueKpis({
  periodo,
  ambito,
  reparto,
}: {
  periodo: Periodo;
  ambito: Ambito;
  reparto: boolean;
}) {
  const [{ actual, anterior, hayAnterior }, saldo] = await Promise.all([
    obtenerResumenComparado(periodo, ambito),
    obtenerTesoreria(),
  ]);

  if (ambito.tipo === "general") {
    const tiendas = await obtenerResumen(periodo.desde, periodo.hasta, TODAS);
    return (
      <TarjetasKpiGeneral
        periodo={periodo}
        actual={actual}
        anterior={anterior}
        hayAnterior={hayAnterior}
        saldo={saldo}
        // General nunca factura: los ingresos de «Todas» son los de las tiendas.
        facturacionTiendas={tiendas.ingresos}
      />
    );
  }

  if (ambito.tipo === "todas") {
    return (
      <TarjetasKpi
        ambito={ambito}
        periodo={periodo}
        actual={actual}
        anterior={anterior}
        hayAnterior={hayAnterior}
        saldo={saldo}
      />
    );
  }

  const tiendaId = ambito.tienda.id;
  const previo = periodoAnterior(periodo);

  const [beneficioAcumulado, ultimaVenta, comparativa, comparativaAnterior] =
    await Promise.all([
      obtenerBeneficioAcumulado(ambito),
      obtenerUltimaVenta(ambito),
      reparto ? obtenerComparativaTiendas(periodo.desde, periodo.hasta) : null,
      reparto ? obtenerComparativaTiendas(previo.desde, previo.hasta) : null,
    ]);

  // Reparto visual: también al periodo anterior, o la variación compararía
  // un beneficio con su parte de General contra otro sin ella.
  const repartoActual = comparativa ? calcularReparto(comparativa, tiendaId) : null;
  const repartoAnterior = comparativaAnterior
    ? calcularReparto(comparativaAnterior, tiendaId)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {ultimaVenta === null ? <AvisoSinDiario slug={ambito.slug} /> : null}

      {repartoActual ? (
        <NotaReparto reparto={repartoActual} nombreTienda={ambito.tienda.nombre} />
      ) : null}

      <TarjetasKpi
        ambito={ambito}
        periodo={periodo}
        actual={repartoActual ? aplicarReparto(actual, repartoActual) : actual}
        anterior={repartoAnterior ? aplicarReparto(anterior, repartoAnterior) : anterior}
        hayAnterior={hayAnterior}
        saldo={saldo}
        beneficioAcumulado={beneficioAcumulado}
        reparto={repartoActual}
      />
    </div>
  );
}

/** Vista «Todas»: una fila por tienda y la de General, con el periodo elegido. */
async function BloqueComparativa({ periodo }: { periodo: Periodo }) {
  const filas = await obtenerComparativaTiendas(periodo.desde, periodo.hasta);

  return (
    <TarjetaBloque
      titulo="Comparativa por tienda"
      descripcion="El periodo seleccionado, tienda a tienda. Pulsa una para verla."
    >
      <TablaComparativa filas={filas} />
    </TarjetaBloque>
  );
}

async function BloqueGraficos({ periodo, ambito }: { periodo: Periodo; ambito: Ambito }) {
  const [dias, gastos] = await Promise.all([
    obtenerSerieDiaria(periodo.desde, periodo.hasta, ambito),
    obtenerGastosPorCategoria(periodo.desde, periodo.hasta, ambito),
  ]);

  const puntos = agruparSerie(dias, agrupacionDePeriodo(periodo), periodo);
  const porciones = agruparCola(gastos, 6);
  const totalGastos = porciones.reduce((suma, p) => suma + p.total, 0);

  const agrupacion = agrupacionDePeriodo(periodo);
  const descripcion =
    diasDelPeriodo(periodo) === 1
      ? "Total del día. Los movimientos no llevan hora, así que no se desglosa por horas."
      : agrupacion === "dia"
      ? "Agrupado por día."
      : agrupacion === "semana"
        ? "Agrupado por semana."
        : "Agrupado por mes.";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TarjetaBloque
        titulo="Evolución"
        descripcion={
          ambito.tipo === "general"
            ? `${descripcion} En General solo hay gastos: la facturación sale a cero a propósito.`
            : descripcion
        }
        className="lg:col-span-2"
      >
        <GraficoEvolucion puntos={puntos} />
        <TablaEvolucion puntos={puntos} />
      </TarjetaBloque>

      <TarjetaBloque
        titulo={ambito.tipo === "general" ? "Gastos compartidos" : "Desglose de gastos"}
        descripcion="Por categoría."
      >
        <GraficoGastosCategoria
          porciones={porciones}
          total={Math.round(totalGastos * 100) / 100}
        />
      </TarjetaBloque>
    </div>
  );
}

async function BloquePublicidad({ periodo, ambito }: { periodo: Periodo; ambito: Ambito }) {
  const resumen = await obtenerResumen(periodo.desde, periodo.hasta, ambito);

  // Sin inversión publicitaria, el bloque entero sobra. En General, además,
  // no hay facturación con la que medirla: no tiene sentido.
  if (resumen.gastoAds === 0 || ambito.tipo === "general") return null;

  const [dias, plataformas] = await Promise.all([
    obtenerSerieDiaria(periodo.desde, periodo.hasta, ambito),
    obtenerGastoPorPlataforma(periodo.desde, periodo.hasta, ambito),
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

async function BloqueUltimos({ periodo, ambito }: { periodo: Periodo; ambito: Ambito }) {
  const [movimientos, renovaciones, cupo, tiendas] = await Promise.all([
    obtenerUltimosMovimientos(periodo.desde, periodo.hasta, 8, ambito),
    obtenerProximasRenovaciones(3, ambito),
    obtenerCupoTarjeta(),
    ambito.tipo === "todas" ? obtenerTiendas() : null,
  ]);

  // El periodo y la tienda viajan a /movimientos para no perder el contexto.
  const query = escribirPeriodo(periodo);
  const enlace = conTienda(
    query
      ? `/movimientos?preset=personalizado&desde=${periodo.desde}&hasta=${periodo.hasta}`
      : "/movimientos",
    ambito.slug,
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <UltimosMovimientos
          movimientos={movimientos}
          enlaceVerTodos={enlace}
          tiendas={tiendas}
        />
      </div>
      {/* La tarjeta de Daniel es de la sociedad: sale en todas las vistas. */}
      <div className="flex min-w-0 flex-col gap-4">
        <WidgetTarjeta inicial={cupo} />
        <ProximasRenovaciones
          cuentas={renovaciones}
          enlace={conTienda("/cuentas", ambito.slug)}
        />
      </div>
    </div>
  );
}

/** Caja y tarjeta: lo de la sociedad, que se ve aunque la tienda esté vacía. */
async function BloqueSociedad({ ambito }: { ambito: Ambito }) {
  const [saldo, cupo] = await Promise.all([obtenerTesoreria(), obtenerCupoTarjeta()]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TarjetaCaja
        saldo={saldo}
        slug={ambito.slug}
        beneficioAcumulado={ambito.tipo === "tienda" ? 0 : null}
      />
      <WidgetTarjeta inicial={cupo} />
    </div>
  );
}
