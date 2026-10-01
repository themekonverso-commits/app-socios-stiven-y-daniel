import {
  Banknote,
  Megaphone,
  PiggyBank,
  Receipt,
  Target,
  Wallet,
} from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
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
} from "@/lib/kpis";
import type { ResumenPeriodo, SaldoCaja } from "@/lib/consultas-kpi";
import type { Periodo } from "@/lib/periodo";

/** Un número de una cifra o un guion. Nunca NaN, nunca Infinity. */
function o(valor: number | null, formatear: (v: number) => string): string {
  return valor === null ? "—" : formatear(valor);
}

export function TarjetasKpi({
  periodo,
  actual,
  anterior,
  hayAnterior,
  saldo,
}: {
  periodo: Periodo;
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  hayAnterior: boolean;
  saldo: SaldoCaja;
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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1 · FACTURACIÓN — la única destacada */}
      <KpiCard
        destacada
        icono={Banknote}
        titulo="Facturación"
        subtitulo="Ingresos totales del periodo"
        valor={formatearEuros(actual.ingresos)}
        variacion={varDe(actual.ingresos, anterior.ingresos)}
        etiquetaVariacion={vs}
        enlace={{ href: "/kpis", texto: "Ver análisis" }}
      />

      {/* 2 · BENEFICIO NETO */}
      <KpiCard
        icono={PiggyBank}
        titulo="Beneficio neto"
        subtitulo="Ingresos menos gastos"
        valor={formatearEuros(actual.beneficio)}
        claseValor={actual.beneficio >= 0 ? "text-success" : "text-danger"}
        nota={
          margenActual === null
            ? "Sin facturación, no hay margen que calcular"
            : `Margen del ${formatearPorcentaje(margenActual)} % sobre facturación`
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

      {/* 6 · SALDO EN BANCO — NO depende del selector de periodo */}
      <KpiCard
        icono={Wallet}
        titulo="Saldo en banco"
        subtitulo={`${formatearEuros(saldo.pendienteShopify)} pendientes en Shopify`}
        valor={formatearEuros(saldo.saldoBanco)}
        claseValor={saldo.saldoBanco >= 0 ? "text-text-primary" : "text-danger"}
        nota={
          saldo.fechaInicial
            ? "Al margen del periodo seleccionado"
            : "Configura el saldo inicial en Ajustes"
        }
        enlace={{ href: "/cobros", texto: "Ver cobros" }}
      />
    </div>
  );
}
