import { Landmark, Percent, Receipt, TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { KpiCard } from "@/components/kpi-card";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import { FormularioCobro } from "@/components/cobros/formulario-cobro";
import { ListaCobros } from "@/components/cobros/lista-cobros";
import { obtenerCobros, resumirCobros } from "@/lib/consultas-cobros";
import { obtenerUsuarioActual } from "@/lib/consultas-liquidacion";
import { formatearEuros, formatearPorcentaje } from "@/lib/formato";
import { leerPeriodo } from "@/lib/periodo";

export const metadata = { title: "Cobros" };

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * Cobros de la pasarela: lo que Shopify paga al banco.
 *
 * No son ingresos (las ventas ya están en /diario). Lo que aporta la pantalla
 * es la conciliación: cada payout contra lo registrado esos días.
 */
export default async function PaginaCobros({ searchParams }: { searchParams: Params }) {
  const periodo = leerPeriodo(await searchParams);

  const [{ cobros, error }, usuarioId] = await Promise.all([
    obtenerCobros(periodo.desde, periodo.hasta),
    obtenerUsuarioActual(),
  ]);

  const resumen = resumirCobros(cobros);
  const descuadres = cobros.filter((c) => !c.cuadra).length;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Cobros"
        descripcion="Lo que Shopify paga al banco, conciliado con /diario."
        acciones={<SelectorPeriodo periodo={periodo} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          destacada
          icono={Landmark}
          titulo="Cobrado en el periodo"
          subtitulo={
            resumen.numero === 0
              ? "Sin cobros en el periodo"
              : `${resumen.numero} cobro${resumen.numero === 1 ? "" : "s"} · neto al banco`
          }
          valor={formatearEuros(resumen.cobrado)}
        />
        <KpiCard
          icono={Receipt}
          titulo="Comisiones pagadas"
          subtitulo={`Sobre ${formatearEuros(resumen.bruto)} de ventas cobradas`}
          valor={formatearEuros(resumen.comisiones)}
        />
        <KpiCard
          icono={Percent}
          titulo="Comisión media"
          subtitulo="Comisiones sobre el bruto"
          valor={
            resumen.pctMedio === null ? "—" : formatearPorcentaje(resumen.pctMedio, 2)
          }
          claseValor={
            resumen.pctMedio !== null && resumen.pctMedio > 4 ? "text-warning" : undefined
          }
          nota={
            resumen.pctMedio !== null && resumen.pctMedio > 4
              ? "Por encima del 4 %"
              : undefined
          }
        />
      </div>

      <FormularioCobro />

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 font-medium text-danger">
            <TriangleAlert aria-hidden="true" className="size-4" />
            No se han podido cargar los cobros
          </p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </div>
      ) : cobros.length === 0 ? (
        <EstadoVacio
          icono={Landmark}
          titulo="No hay cobros en este periodo"
          descripcion="Cuando Shopify haga un pago al banco, regístralo arriba con su desglose."
        />
      ) : (
        <>
          {descuadres > 0 ? (
            <p className="flex items-center gap-2 text-sm text-warning">
              <TriangleAlert aria-hidden="true" className="size-4" />
              {descuadres === 1
                ? "1 cobro no cuadra con /diario."
                : `${descuadres} cobros no cuadran con /diario.`}{" "}
              Revisa los días de su periodo.
            </p>
          ) : null}
          <ListaCobros cobros={cobros} usuarioId={usuarioId ?? ""} />
        </>
      )}
    </div>
  );
}
