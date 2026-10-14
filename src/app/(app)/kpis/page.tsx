import { Suspense } from "react";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subQuarters,
} from "date-fns";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { EsqueletoBloque } from "@/components/dashboard/esqueletos";
import { CategoriasApiladas } from "@/components/kpis/categorias-apiladas";
import { Objetivos } from "@/components/kpis/objetivos";
import { SemaforoAlertas, type Alerta } from "@/components/kpis/semaforo-alertas";
import { SemaforoCupo } from "@/components/kpis/semaforo-cupo";
import { TablaMensual } from "@/components/kpis/tabla-mensual";
import {
  obtenerAjustes,
  obtenerGastosCategoriaPorMes,
  obtenerResumen,
  obtenerTesoreria,
  obtenerSerieMensual,
  obtenerUltimaVenta,
} from "@/lib/consultas-kpi";
import { obtenerCierres, obtenerResumenSocios } from "@/lib/consultas-liquidacion";
import { obtenerCupoTarjeta } from "@/lib/consultas-cupo";
import { nivelCupo } from "@/lib/cupo";
import { leerPeriodo, type Periodo } from "@/lib/periodo";
import { obtenerResumenCuentas } from "@/lib/consultas-cuentas";
import { obtenerResumenCobros } from "@/lib/consultas-cobros";
import { obtenerAmbito, obtenerTiendas } from "@/lib/tiendas";
import { SLUG_TODAS, conTienda, type Ambito } from "@/lib/ambito";
import { redondear2 } from "@/lib/dinero";
import { trimestreDe } from "@/lib/trimestres";
import { calcularRoas, porcentaje } from "@/lib/kpis";
import { formatearEuros, formatearFecha, formatearNumero } from "@/lib/formato";

export const metadata = { title: "KPIs" };
export const revalidate = 60;

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaKpis({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const periodo = leerPeriodo(params);
  const ambito = await obtenerAmbito();
  const clave = `${ambito.slug}-${JSON.stringify(params)}`;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="KPIs"
        descripcion={
          ambito.tipo === "general"
            ? "Los gastos compartidos de la sociedad, con calma."
            : "El detalle, para mirarlo con calma."
        }
        acciones={<SelectorPeriodo periodo={periodo} />}
      />

      <Suspense key={`alertas-${clave}`} fallback={<EsqueletoBloque alto={200} />}>
        <BloqueAlertas periodo={periodo} ambito={ambito} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense key={`objetivos-${clave}`} fallback={<EsqueletoBloque alto={240} />}>
          <BloqueObjetivos ambito={ambito} />
        </Suspense>

        <Suspense key={`cupo-${clave}`} fallback={<EsqueletoBloque alto={240} />}>
          <BloqueCupo />
        </Suspense>
      </div>

      <Suspense key={`mensual-${clave}`} fallback={<EsqueletoBloque alto={420} />}>
        <BloqueMensual ambito={ambito} />
      </Suspense>

      <Suspense key={`categorias-${clave}`} fallback={<EsqueletoBloque alto={380} />}>
        <BloqueCategorias ambito={ambito} />
      </Suspense>
    </div>
  );
}

/**
 * Semáforo de alertas.
 *
 * Los umbrales son fijos y están aquí, en un solo sitio, para que se puedan
 * revisar de un vistazo cuando el negocio cambie de escala.
 *
 * Los avisos de negocio (ROAS, beneficio, ventas, pasarela, cuentas) miran
 * el ámbito elegido. Los de la sociedad (caja, cupo de la tarjeta,
 * liquidación y cierres) salen igual en todas las vistas. En General no hay
 * ventas: los avisos que dependen de facturar no aplican.
 */
async function BloqueAlertas({ periodo, ambito }: { periodo: Periodo; ambito: Ambito }) {
  const hoy = new Date();
  const inicioMes = format(startOfMonth(hoy), "yyyy-MM-dd");
  const finMes = format(endOfMonth(hoy), "yyyy-MM-dd");
  const esGeneral = ambito.tipo === "general";

  const [
    resumenPeriodo,
    resumenMes,
    saldo,
    ultimaVenta,
    socios,
    cupo,
    cierres,
    cobros,
  ] = await Promise.all([
    obtenerResumen(periodo.desde, periodo.hasta, ambito),
    obtenerResumen(inicioMes, finMes, ambito),
    obtenerTesoreria(),
    esGeneral ? null : obtenerUltimaVenta(ambito),
    obtenerResumenSocios(),
    obtenerCupoTarjeta(),
    obtenerCierres(),
    esGeneral ? null : obtenerResumenCobros(periodo.desde, periodo.hasta, ambito),
  ]);

  const cuentas = await obtenerResumenCuentas(ambito);

  // El negocio arranca con la fecha del saldo inicial: no tiene sentido avisar
  // de trimestres anteriores a que existiera.
  const { saldoInicial } = await obtenerAjustes();

  const alertas: Alerta[] = [];

  const roas = calcularRoas(resumenPeriodo.ingresos, resumenPeriodo.gastoAds);
  if (roas !== null && roas < 1.5) {
    alertas.push({
      nivel: "rojo",
      titulo: `ROAS de ${formatearNumero(roas)}x en el periodo`,
      detalle:
        "Por debajo de 1,5x cada euro invertido en publicidad devuelve menos de lo que cuesta sostener la operación.",
    });
  }

  // En General el beneficio siempre es negativo: solo hay gastos.
  if (!esGeneral && resumenMes.beneficio < 0) {
    alertas.push({
      nivel: "rojo",
      titulo: "Beneficio negativo este mes",
      detalle: `Llevas ${formatearEuros(resumenMes.beneficio)} en el mes en curso: los gastos superan a los ingresos.`,
    });
  }

  const pctAds = porcentaje(resumenPeriodo.gastoAds, resumenPeriodo.ingresos);
  if (pctAds !== null && pctAds > 60) {
    alertas.push({
      nivel: "ambar",
      titulo: `La publicidad se lleva el ${formatearNumero(pctAds)} % de la facturación`,
      detalle:
        "Por encima del 60 % queda muy poco margen para producto, envíos y comisiones.",
    });
  }

  if (saldo.cajaTotal < 500) {
    alertas.push({
      nivel: "ambar",
      titulo: `Caja baja: ${formatearEuros(saldo.cajaTotal)} (banco ${formatearEuros(saldo.saldoBanco)} · PayPal ${formatearEuros(saldo.saldoPaypal)})`,
      detalle:
        "Por debajo de 500 € cualquier imprevisto obliga a que un socio adelante dinero.",
    });
  }

  // Comisión de la pasarela: sobre el bruto de los cobros del periodo.
  if (cobros && cobros.pctMedio !== null && cobros.pctMedio > 4) {
    alertas.push({
      nivel: "ambar",
      titulo: `La pasarela se lleva el ${formatearNumero(cobros.pctMedio)} % de lo cobrado`,
      detalle: `${formatearEuros(cobros.comisiones)} de comisiones sobre ${formatearEuros(cobros.bruto)} de ventas en ${cobros.numero} cobro${cobros.numero === 1 ? "" : "s"}. Por encima del 4 % conviene revisar el plan de Shopify Payments o los métodos de pago.`,
      enlace: { href: conTienda("/cobros", ambito.slug), texto: "Ver los cobros" },
    });
  }

  if (esGeneral) {
    // General no registra ventas: no hay nada que avisar.
  } else if (ultimaVenta) {
    const dias = differenceInCalendarDays(hoy, parseISO(ultimaVenta));
    if (dias > 7) {
      alertas.push({
        nivel: "ambar",
        titulo: `${dias} días sin registrar ventas`,
        detalle: `El último registro diario es del ${formatearFecha(ultimaVenta)}. Sin él, los KPIs se quedan cortos.`,
        enlace: { href: conTienda("/diario", ambito.slug), texto: "Ir al registro diario" },
      });
    }
  } else {
    alertas.push({
      nivel: "ambar",
      titulo: "Todavía no hay ningún registro diario de ventas",
      detalle:
        "Sin pedidos registrados no se pueden calcular el ticket medio ni el CPA.",
      enlace: { href: conTienda("/diario", ambito.slug), texto: "Registrar el primer día" },
    });
  }

  // ── Avisos de la liquidación (fase 3) ──────────────────────────────────
  const pendienteTotal =
    Math.round(socios.reduce((suma, s) => suma + Math.max(s.pendiente, 0), 0) * 100) / 100;

  if (pendienteTotal > 1000) {
    alertas.push({
      nivel: "ambar",
      titulo: `${formatearEuros(pendienteTotal)} de anticipos pendientes`,
      detalle:
        "Por encima de 1.000 € conviene devolverlos: hasta que se salden, el contrato impide repartir beneficio.",
      enlace: { href: "/liquidacion", texto: "Ver la liquidación" },
    });
  }

  // R6: el cupo de la tarjeta es de la sociedad (todas las tiendas y
  // General). Ámbar desde el umbral de aviso, rojo al llegar al 100 %.
  const nivel = nivelCupo(cupo);
  if (cupo.limite > 0 && nivel !== "ok") {
    alertas.push({
      nivel: nivel === "superado" ? "rojo" : "ambar",
      titulo:
        nivel === "superado"
          ? `La tarjeta de ${cupo.socio_nombre ?? "Daniel"} ha superado el cupo`
          : `La tarjeta de ${cupo.socio_nombre ?? "Daniel"} lleva el ${formatearNumero(cupo.pct ?? 0)} % del cupo`,
      detalle: `${formatearEuros(cupo.consumido)} de los ${formatearEuros(cupo.limite)} acordados, sumando todas las tiendas y General. El contrato prevé convocar la reunión de continuidad.`,
      enlace: {
        href: conTienda("/movimientos?medio=tarjeta_daniel", SLUG_TODAS),
        texto: "Ver los gastos de la tarjeta",
      },
    });
  }

  // Trimestre terminado hace más de 15 días y todavía sin cerrar.
  const trimestreAnterior = trimestreDe(subQuarters(hoy, 1), hoy);
  const yaCerrado = cierres.some(
    (c) =>
      c.periodo_inicio === trimestreAnterior.inicio &&
      c.periodo_fin === trimestreAnterior.fin &&
      c.estado !== "anulado",
  );
  const diasDesdeCierre = differenceInCalendarDays(
    hoy,
    parseISO(trimestreAnterior.fin),
  );

  const trimestreRelevante = trimestreAnterior.fin >= saldoInicial.fecha;

  if (trimestreRelevante && !yaCerrado && diasDesdeCierre > 15) {
    alertas.push({
      nivel: "ambar",
      titulo: `${trimestreAnterior.etiqueta} terminó hace ${diasDesdeCierre} días y sigue sin cerrar`,
      detalle:
        "El cierre trimestral es el acta de la reunión: fija el reparto y el arrastre de pérdidas del siguiente periodo.",
      enlace: { href: "/liquidacion/cierres", texto: "Crear el cierre" },
    });
  }

  const borradores = cierres.filter((c) => c.estado === "borrador");
  for (const borrador of borradores) {
    const firmas = Object.keys(borrador.aprobaciones ?? {}).length;
    alertas.push({
      nivel: "info",
      titulo: `El cierre ${borrador.etiqueta} espera aprobación`,
      detalle: `Lleva ${firmas} de ${socios.length} firmas. Hasta que estén las dos, el acta no queda cerrada.`,
      enlace: { href: "/liquidacion/cierres", texto: "Revisar y firmar" },
    });
  }

  // ── Avisos del inventario de cuentas (fase 4) ──────────────────────────
  if (cuentas.vencidas.length > 0) {
    alertas.push({
      nivel: "rojo",
      titulo: `${cuentas.vencidas.length} cuenta${cuentas.vencidas.length === 1 ? "" : "s"} con la renovación vencida`,
      detalle: cuentas.vencidas
        .slice(0, 3)
        .map((c) => c.nombre)
        .join(", "),
      enlace: { href: conTienda("/cuentas", ambito.slug), texto: "Revisar el inventario" },
    });
  }

  if (cuentas.proximas.length > 0) {
    alertas.push({
      nivel: "ambar",
      titulo: `${cuentas.proximas.length} cuenta${cuentas.proximas.length === 1 ? "" : "s"} renueva${cuentas.proximas.length === 1 ? "" : "n"} en los próximos días`,
      detalle: cuentas.proximas
        .slice(0, 3)
        .map((c) => c.nombre)
        .join(", "),
      enlace: { href: conTienda("/cuentas", ambito.slug), texto: "Ver renovaciones" },
    });
  }

  const pesoSuscripciones = porcentaje(cuentas.costeMensual, resumenMes.ingresos);
  if (pesoSuscripciones !== null && pesoSuscripciones > 15) {
    alertas.push({
      nivel: "ambar",
      titulo: `Las suscripciones se llevan el ${formatearNumero(pesoSuscripciones)} % de la facturación`,
      detalle: `${formatearEuros(cuentas.costeMensual)} al mes en cuentas activas. Por encima del 15 % conviene revisar cuáles se usan de verdad.`,
      enlace: { href: conTienda("/cuentas", ambito.slug), texto: "Revisar suscripciones" },
    });
  }

  return (
    <TarjetaBloque
      titulo="Semáforo"
      descripcion="Avisos calculados sobre los datos actuales."
    >
      <SemaforoAlertas alertas={alertas} />
    </TarjetaBloque>
  );
}

/**
 * Objetivos del mes en curso. Son de cada tienda (`tiendas.objetivo_mes`):
 *   tienda  → los suyos;
 *   todas   → la suma de los de las tiendas activas;
 *   general → ninguno, porque General no factura.
 */
async function BloqueObjetivos({ ambito }: { ambito: Ambito }) {
  const hoy = new Date();
  const inicioMes = format(startOfMonth(hoy), "yyyy-MM-dd");
  const finMes = format(endOfMonth(hoy), "yyyy-MM-dd");

  if (ambito.tipo === "general") {
    return (
      <TarjetaBloque
        titulo="Objetivos del mes"
        descripcion="General / Sociedad no tiene objetivos."
      >
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
          Aquí solo hay gastos compartidos, que no facturan: los objetivos de facturación y
          de beneficio se fijan en cada tienda.
        </p>
      </TarjetaBloque>
    );
  }

  const [tiendas, resumenMes] = await Promise.all([
    obtenerTiendas(),
    obtenerResumen(inicioMes, finMes, ambito),
  ]);

  const activas = tiendas.filter((t) => t.estado === "activa");
  const objetivo =
    ambito.tipo === "tienda"
      ? ambito.tienda.objetivo_mes
      : {
          facturacion: redondear2(activas.reduce((s, t) => s + t.objetivo_mes.facturacion, 0)),
          beneficio: redondear2(activas.reduce((s, t) => s + t.objetivo_mes.beneficio, 0)),
        };

  return (
    <TarjetaBloque
      titulo="Objetivos del mes"
      descripcion="Siempre sobre el mes en curso, no sobre el periodo seleccionado."
    >
      <Objetivos
        facturacionMes={resumenMes.ingresos}
        beneficioMes={resumenMes.beneficio}
        objetivoFacturacion={objetivo.facturacion}
        objetivoBeneficio={objetivo.beneficio}
        diasRestantes={differenceInCalendarDays(endOfMonth(hoy), hoy)}
        enlaceDefinir={conTienda("/tiendas", ambito.slug)}
        nota={
          ambito.tipo === "todas"
            ? `Suma de los objetivos de ${activas.length} tienda${activas.length === 1 ? "" : "s"} activa${activas.length === 1 ? "" : "s"}. El beneficio incluye los gastos de General.`
            : undefined
        }
      />
    </TarjetaBloque>
  );
}

/** Semáforo del cupo de la tarjeta: global, en todas las vistas. */
async function BloqueCupo() {
  const cupo = await obtenerCupoTarjeta();

  return (
    <TarjetaBloque
      titulo="Cupo de la tarjeta"
      descripcion="De la sociedad: el mismo en todas las tiendas."
    >
      <SemaforoCupo
        cupo={cupo}
        enlace={conTienda("/movimientos?medio=tarjeta_daniel", SLUG_TODAS)}
      />
    </TarjetaBloque>
  );
}

async function BloqueMensual({ ambito }: { ambito: Ambito }) {
  const filas = await obtenerSerieMensual(12, ambito);

  return (
    <TarjetaBloque
      titulo="Comparativa mensual"
      descripcion={
        ambito.tipo === "general"
          ? "Los últimos 12 meses. En General solo hay gastos: facturación, ROAS y ticket salen vacíos a propósito."
          : "Los últimos 12 meses. Pulsa una cabecera para ordenar."
      }
    >
      <TablaMensual filas={filas} />
    </TarjetaBloque>
  );
}

async function BloqueCategorias({ ambito }: { ambito: Ambito }) {
  const datos = await obtenerGastosCategoriaPorMes(12, ambito);

  return (
    <TarjetaBloque
      titulo="Evolución de categorías"
      descripcion="Para detectar a tiempo si una partida se está descontrolando."
    >
      <CategoriasApiladas datos={datos} />
    </TarjetaBloque>
  );
}
