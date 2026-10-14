import {
  Banknote,
  Megaphone,
  Percent,
  PiggyBank,
  Receipt,
  Target,
  Users,
  Wallet,
} from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { conTienda, type Ambito } from "@/lib/ambito";
import {
  formatearEntero,
  formatearEuros,
  formatearPorcentaje,
} from "@/lib/formato";
import {
  CLASE_NIVEL_ROAS,
  ETIQUETA_NIVEL_ROAS,
  calcularRoas,
  dividir,
  margen,
  nivelRoas,
  porcentaje,
  variacion,
  type Reparto,
} from "@/lib/kpis";
import type { ResumenPeriodo, Tesoreria } from "@/lib/consultas-kpi";
import type { Periodo } from "@/lib/periodo";

/** Un número de una cifra o un guion. Nunca NaN, nunca Infinity. */
function o(valor: number | null, formatear: (v: number) => string): string {
  return valor === null ? "—" : formatear(valor);
}

/**
 * Caja de la sociedad: banco + PayPal. Es de los dos socios, no de una
 * tienda, así que sale igual en todas las vistas y no depende del periodo.
 * En una tienda concreta lleva debajo su beneficio acumulado, que NO es caja.
 */
export function TarjetaCaja({
  saldo,
  slug,
  beneficioAcumulado,
}: {
  saldo: Tesoreria;
  slug: string;
  beneficioAcumulado: number | null;
}) {
  return (
    <KpiCard
      icono={Wallet}
      titulo="Caja de la sociedad"
      subtitulo="Banco + PayPal, hoy · todas las tiendas"
      valor={formatearEuros(saldo.cajaTotal)}
      claseValor={saldo.cajaTotal >= 0 ? "text-text-primary" : "text-danger"}
      desglose={[
        { etiqueta: "Banco", valor: formatearEuros(saldo.saldoBanco) },
        { etiqueta: "PayPal", valor: formatearEuros(saldo.saldoPaypal) },
        {
          etiqueta: "Pendiente de cobro",
          valor: formatearEuros(saldo.pendienteTotal),
          apagado: true,
        },
      ]}
      pie={
        beneficioAcumulado === null
          ? undefined
          : {
              etiqueta: "Beneficio acumulado de esta tienda",
              valor: formatearEuros(beneficioAcumulado),
              claseValor: beneficioAcumulado >= 0 ? "text-success" : "text-danger",
              nota: "Desde su primer movimiento. Es beneficio, no dinero en caja: la caja es común.",
            }
      }
      nota={
        saldo.fechaInicialBanco
          ? "Al margen del periodo y de la tienda seleccionados"
          : "Configura los saldos iniciales en Ajustes"
      }
      enlace={{ href: conTienda("/cobros", slug), texto: "Ver cobros" }}
    />
  );
}

/**
 * Indicadores de una tienda o de «Todas». Con el reparto activado, `actual`
 * y `anterior` ya llegan con la parte de General sumada a los gastos.
 */
export function TarjetasKpi({
  ambito,
  periodo,
  actual,
  anterior,
  hayAnterior,
  saldo,
  beneficioAcumulado = null,
  reparto = null,
}: {
  ambito: Ambito;
  periodo: Periodo;
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  hayAnterior: boolean;
  saldo: Tesoreria;
  /** Solo en una tienda concreta. */
  beneficioAcumulado?: number | null;
  /** Reparto de General aplicado al periodo actual, si el interruptor está activo. */
  reparto?: Reparto | null;
}) {
  const vs = periodo.comparativa;

  /** Sin histórico, ninguna comparación es honesta. */
  const varDe = (a: number, b: number) => (hayAnterior ? variacion(a, b) : null);

  const margenActual = margen(actual.beneficio, actual.ingresos);
  const pctAds = porcentaje(actual.gastoAds, actual.ingresos);

  const roas = calcularRoas(actual.ingresos, actual.gastoAds);
  const roasAnterior = calcularRoas(anterior.ingresos, anterior.gastoAds);
  const nivel = nivelRoas(roas);

  const ticket = dividir(actual.ingresos, actual.pedidos, 2);
  const ticketAnterior = dividir(anterior.ingresos, anterior.pedidos, 2);

  const notaMargen =
    margenActual === null
      ? "Sin facturación, no hay margen que calcular"
      : `Margen del ${formatearPorcentaje(margenActual)} % sobre facturación`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1 · FACTURACIÓN — la única destacada */}
      <KpiCard
        destacada
        icono={Banknote}
        titulo="Facturación"
        subtitulo={
          ambito.tipo === "todas" ? "Ingresos de todas las tiendas" : "Ingresos totales del periodo"
        }
        valor={formatearEuros(actual.ingresos)}
        variacion={varDe(actual.ingresos, anterior.ingresos)}
        etiquetaVariacion={vs}
        enlace={{ href: conTienda("/kpis", ambito.slug), texto: "Ver análisis" }}
      />

      {/* 2 · BENEFICIO NETO */}
      <KpiCard
        icono={PiggyBank}
        titulo="Beneficio neto"
        subtitulo={
          reparto?.aplica
            ? "Con su parte de los gastos generales"
            : ambito.tipo === "todas"
              ? "Ingresos menos gastos, General incluido"
              : "Ingresos menos gastos"
        }
        valor={formatearEuros(actual.beneficio)}
        claseValor={actual.beneficio >= 0 ? "text-success" : "text-danger"}
        nota={
          reparto?.aplica
            ? `${notaMargen}. Incluye ${formatearEuros(reparto.imputado)} de General.`
            : notaMargen
        }
        variacion={varDe(actual.beneficio, anterior.beneficio)}
        etiquetaVariacion={vs}
      />

      {/* 3 · GASTO PUBLICITARIO — aquí subir es empeorar */}
      <KpiCard
        icono={Megaphone}
        titulo="Gasto publicitario"
        subtitulo="Categoría Publicidad"
        valor={formatearEuros(actual.gastoAds)}
        nota={
          pctAds === null
            ? "Sin facturación con la que compararlo"
            : `${formatearPorcentaje(pctAds)} % de la facturación`
        }
        variacion={varDe(actual.gastoAds, anterior.gastoAds)}
        etiquetaVariacion={vs}
        sentidoVariacion="menos-es-mejor"
      />

      {/* 4 · ROAS */}
      <KpiCard
        icono={Target}
        titulo="ROAS"
        subtitulo="Retorno por cada euro invertido"
        valor={o(roas, (v) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`)}
        claseValor={CLASE_NIVEL_ROAS[nivel]}
        nota={ETIQUETA_NIVEL_ROAS[nivel]}
        variacion={
          hayAnterior && roas !== null && roasAnterior !== null
            ? variacion(roas, roasAnterior)
            : null
        }
        etiquetaVariacion={vs}
      />

      {/* 5 · TICKET MEDIO */}
      <KpiCard
        icono={Receipt}
        titulo="Ticket medio"
        subtitulo={
          actual.pedidos > 0
            ? `${formatearEntero(actual.pedidos)} pedido${actual.pedidos === 1 ? "" : "s"} en el periodo`
            : "Sin pedidos registrados"
        }
        valor={o(ticket, formatearEuros)}
        variacion={
          hayAnterior && ticket !== null && ticketAnterior !== null
            ? variacion(ticket, ticketAnterior)
            : null
        }
        etiquetaVariacion={vs}
      />

      {/* 6 · CAJA DE LA SOCIEDAD — global, NO depende del periodo ni de la tienda */}
      <TarjetaCaja saldo={saldo} slug={ambito.slug} beneficioAcumulado={beneficioAcumulado} />
    </div>
  );
}

/**
 * Indicadores de «General / Sociedad». Aquí solo hay gastos compartidos: no
 * hay facturación, así que ROAS, ticket medio, pedidos y margen no existen y
 * no se pintan. En su lugar, cuánto pesa lo compartido sobre lo que facturan
 * las tiendas.
 */
export function TarjetasKpiGeneral({
  periodo,
  actual,
  anterior,
  hayAnterior,
  saldo,
  facturacionTiendas,
}: {
  periodo: Periodo;
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  hayAnterior: boolean;
  saldo: Tesoreria;
  /** Lo que facturaron entre todas las tiendas en el periodo. */
  facturacionTiendas: number;
}) {
  const vs = periodo.comparativa;
  const peso = porcentaje(actual.gastos, facturacionTiendas);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        destacada
        icono={Users}
        titulo="Gastos compartidos"
        subtitulo="Lo que no es de ninguna tienda"
        valor={formatearEuros(actual.gastos)}
        nota="Herramientas y servicios de la sociedad: Claude, Apimart…"
        variacion={hayAnterior ? variacion(actual.gastos, anterior.gastos) : null}
        etiquetaVariacion={vs}
        sentidoVariacion="menos-es-mejor"
        enlace={{ href: conTienda("/kpis", "general"), texto: "Ver análisis" }}
      />

      <KpiCard
        icono={Percent}
        titulo="Peso sobre la facturación"
        subtitulo="Gastos compartidos / facturación de las tiendas"
        valor={o(peso, (v) => `${formatearPorcentaje(v)} %`)}
        nota={
          peso === null
            ? "Ninguna tienda facturó en el periodo: no hay con qué compararlo"
            : `Sobre ${formatearEuros(facturacionTiendas)} facturados entre todas las tiendas`
        }
      />

      <TarjetaCaja saldo={saldo} slug="general" beneficioAcumulado={null} />
    </div>
  );
}
