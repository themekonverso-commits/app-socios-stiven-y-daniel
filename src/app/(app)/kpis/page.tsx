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
import { TablaMensual } from "@/components/kpis/tabla-mensual";
import {
  obtenerAjustes,
  obtenerGastosCategoriaPorMes,
  obtenerResumen,
  obtenerSaldoCaja,
  obtenerSerieMensual,
  obtenerUltimaVenta,
} from "@/lib/consultas-kpi";
import {
  obtenerCierres,
  obtenerLimiteAportacion,
  obtenerResumenSocios,
} from "@/lib/consultas-liquidacion";
import { leerPeriodo, type Periodo } from "@/lib/periodo";
import { obtenerResumenCuentas } from "@/lib/consultas-cuentas";
import { obtenerResumenCobros } from "@/lib/consultas-cobros";
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
  const clave = JSON.stringify(params);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="KPIs"
        descripcion="El detalle, para mirarlo con calma."
        acciones={<SelectorPeriodo periodo={periodo} />}
      />

      <Suspense key={`alertas-${clave}`} fallback={<EsqueletoBloque alto={200} />}>
        <BloqueAlertas periodo={periodo} />
      </Suspense>

      <Suspense key={`objetivos-${clave}`} fallback={<EsqueletoBloque alto={240} />}>
        <BloqueObjetivos />
      </Suspense>

      <Suspense key={`mensual-${clave}`} fallback={<EsqueletoBloque alto={420} />}>
        <BloqueMensual />
      </Suspense>

      <Suspense key={`categorias-${clave}`} fallback={<EsqueletoBloque alto={380} />}>
        <BloqueCategorias />
      </Suspense>
    </div>
  );
}

/**
 * Semáforo de alertas.
 *
 * Los umbrales son fijos y están aquí, en un solo sitio, para que se puedan
 * revisar de un vistazo cuando el negocio cambie de escala.
 */
async function BloqueAlertas({ periodo }: { periodo: Periodo }) {
  const hoy = new Date();
  const inicioMes = format(startOfMonth(hoy), "yyyy-MM-dd");
  const finMes = format(endOfMonth(hoy), "yyyy-MM-dd");

  const [
    resumenPeriodo,
    resumenMes,
    saldo,
    ultimaVenta,
    socios,
    { limite, avisoPct },
    cierres,
    cobros,
  ] = await Promise.all([
    obtenerResumen(periodo.desde, periodo.hasta),
    obtenerResumen(inicioMes, finMes),
    obtenerSaldoCaja(),
    obtenerUltimaVenta(),
    obtenerResumenSocios(),
    obtenerLimiteAportacion(),
    obtenerCierres(),
    obtenerResumenCobros(periodo.desde, periodo.hasta),
  ]);

  const cuentas = await obtenerResumenCuentas();

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

  if (resumenMes.beneficio < 0) {
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

  if (saldo.saldoBanco < 500) {
    alertas.push({
      nivel: "ambar",
      titulo: `Saldo en banco bajo: ${formatearEuros(saldo.saldoBanco)}`,
      detalle:
        "Por debajo de 500 € cualquier imprevisto obliga a que un socio adelante dinero.",
    });
  }

  // Comisión de la pasarela: sobre el bruto de los cobros del periodo.
  if (cobros.pctMedio !== null && cobros.pctMedio > 4) {
    alertas.push({
      nivel: "ambar",
      titulo: `La pasarela se lleva el ${formatearNumero(cobros.pctMedio)} % de lo cobrado`,
      detalle: `${formatearEuros(cobros.comisiones)} de comisiones sobre ${formatearEuros(cobros.bruto)} de ventas en ${cobros.numero} cobro${cobros.numero === 1 ? "" : "s"}. Por encima del 4 % conviene revisar el plan de Shopify Payments o los métodos de pago.`,
      enlace: { href: "/cobros", texto: "Ver los cobros" },
    });
  }

  if (ultimaVenta) {
    const dias = differenceInCalendarDays(hoy, parseISO(ultimaVenta));
    if (dias > 7) {
      alertas.push({
        nivel: "ambar",
        titulo: `${dias} días sin registrar ventas`,
        detalle: `El último registro diario es del ${formatearFecha(ultimaVenta)}. Sin él, los KPIs se quedan cortos.`,
      });
    }
  } else {
    alertas.push({
      nivel: "ambar",
      titulo: "Todavía no hay ningún registro diario de ventas",
      detalle:
        "Sin pedidos registrados no se pueden calcular el ticket medio ni el CPA.",
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

  // R6: el cupo mide SOLO lo que consume la tarjeta (publicidad). Los
  // anticipos de otras categorías se reembolsan igual y no deben disparar
  // esta alerta.
  if (limite.importe > 0) {
    const ambito = limite.categoria_nombre?.toLowerCase();
    for (const socio of socios) {
      const pct = porcentaje(socio.anticipado_cupo, limite.importe);
      if (pct !== null && pct >= avisoPct) {
        alertas.push({
          nivel: "ambar",
          titulo: `${socio.nombre} ha consumido el ${formatearNumero(pct)} % de su cupo`,
          detalle: `Sobre los ${formatearEuros(limite.importe)} acordados${
            ambito ? ` para ${ambito}` : ""
          }. El contrato prevé convocar la reunión de continuidad.`,
          enlace: { href: "/liquidacion", texto: "Ver el cupo" },
        });
      }
    }
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
      enlace: { href: "/cuentas", texto: "Revisar el inventario" },
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
      enlace: { href: "/cuentas", texto: "Ver renovaciones" },
    });
  }

  const pesoSuscripciones = porcentaje(cuentas.costeMensual, resumenMes.ingresos);
  if (pesoSuscripciones !== null && pesoSuscripciones > 15) {
    alertas.push({
      nivel: "ambar",
      titulo: `Las suscripciones se llevan el ${formatearNumero(pesoSuscripciones)} % de la facturación`,
      detalle: `${formatearEuros(cuentas.costeMensual)} al mes en cuentas activas. Por encima del 15 % conviene revisar cuáles se usan de verdad.`,
      enlace: { href: "/cuentas", texto: "Revisar suscripciones" },
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

async function BloqueObjetivos() {
  const hoy = new Date();
  const inicioMes = format(startOfMonth(hoy), "yyyy-MM-dd");
  const finMes = format(endOfMonth(hoy), "yyyy-MM-dd");

  const [{ objetivos }, resumenMes] = await Promise.all([
    obtenerAjustes(),
    obtenerResumen(inicioMes, finMes),
  ]);

  return (
    <TarjetaBloque
      titulo="Objetivos del mes"
      descripcion="Siempre sobre el mes en curso, no sobre el periodo seleccionado."
    >
      <Objetivos
        facturacionMes={resumenMes.ingresos}
        beneficioMes={resumenMes.beneficio}
        objetivoFacturacion={objetivos.facturacion}
        objetivoBeneficio={objetivos.beneficio}
        diasRestantes={differenceInCalendarDays(endOfMonth(hoy), hoy)}
      />
    </TarjetaBloque>
  );
}

async function BloqueMensual() {
  const filas = await obtenerSerieMensual(12);

  return (
    <TarjetaBloque
      titulo="Comparativa mensual"
      descripcion="Los últimos 12 meses. Pulsa una cabecera para ordenar."
    >
      <TablaMensual filas={filas} />
    </TarjetaBloque>
  );
}

async function BloqueCategorias() {
  const datos = await obtenerGastosCategoriaPorMes(12);

  return (
    <TarjetaBloque
      titulo="Evolución de categorías"
      descripcion="Para detectar a tiempo si una partida se está descontrolando."
    >
      <CategoriasApiladas datos={datos} />
    </TarjetaBloque>
  );
}
