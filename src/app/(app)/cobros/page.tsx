import Link from "next/link";
import { Landmark, Percent, Receipt, TriangleAlert, Wallet } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { KpiCard } from "@/components/kpi-card";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import { PanelRegistro } from "@/components/cobros/panel-registro";
import { ListaCobros } from "@/components/cobros/lista-cobros";
import { ListaTraspasos } from "@/components/cobros/lista-traspasos";
import {
  obtenerCobros,
  obtenerTraspasos,
  resumirCobros,
} from "@/lib/consultas-cobros";
import { obtenerTesoreria } from "@/lib/consultas-kpi";
import { obtenerUsuarioActual } from "@/lib/consultas-liquidacion";
import { obtenerAmbito } from "@/lib/tiendas";
import { formatearEuros, formatearPorcentaje } from "@/lib/formato";
import { PLATAFORMAS_COBRO, type PlataformaCobro } from "@/lib/metodos-cobro";
import { leerPeriodo } from "@/lib/periodo";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cobros" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const FILTROS: { valor: "todos" | PlataformaCobro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "Shopify Payments", etiqueta: "Shopify Payments" },
  { valor: "PayPal", etiqueta: "PayPal" },
];

function leerPlataforma(valor: string | string[] | undefined): PlataformaCobro | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return (PLATAFORMAS_COBRO as readonly string[]).includes(texto ?? "")
    ? (texto as PlataformaCobro)
    : undefined;
}

/**
 * Cobros de la pasarela: lo que Shopify Payments paga al banco y lo que
 * PayPal deja en la cuenta de PayPal. Y los traspasos de PayPal al banco.
 *
 * No son ingresos (las ventas ya están en /diario). Lo que aporta la pantalla
 * es la conciliación de cada cobro contra las ventas de SU tienda y SU
 * método, y la foto de la tesorería: banco, PayPal y lo que queda por cobrar.
 *
 * Multi-tienda (0018): los cobros se filtran por la tienda activa (en «Todas»,
 * todos, cada uno con su tienda; en «General» no hay ninguno). La tesorería y
 * los traspasos PayPal → Banco son de la sociedad: iguales en cualquier vista.
 */
export default async function PaginaCobros({ searchParams }: { searchParams: Params }) {
  const parametros = await searchParams;
  const periodo = leerPeriodo(parametros);
  const plataforma = leerPlataforma(parametros.plataforma);
  const ambito = await obtenerAmbito();

  const [{ cobros, error }, { traspasos }, tesoreria, usuarioId] = await Promise.all([
    obtenerCobros(periodo.desde, periodo.hasta, plataforma, ambito),
    obtenerTraspasos(periodo.desde, periodo.hasta),
    obtenerTesoreria(),
    obtenerUsuarioActual(),
  ]);

  const resumen = resumirCobros(cobros);
  const descuadres = cobros.filter((c) => !c.cuadra).length;
  const solapes = cobros.filter((c) => c.solapados.length > 0).length;
  const destino =
    plataforma === "PayPal" ? "neto a PayPal" : plataforma ? "neto al banco" : "neto a banco y PayPal";

  // El filtro conserva el periodo elegido.
  function enlaceFiltro(valor: "todos" | PlataformaCobro) {
    const query = new URLSearchParams();
    for (const [clave, v] of Object.entries(parametros)) {
      if (clave === "plataforma" || v === undefined) continue;
      query.set(clave, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    if (valor !== "todos") query.set("plataforma", valor);
    const texto = query.toString();
    return texto ? `/cobros?${texto}` : "/cobros";
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Cobros"
        descripcion="Lo que pagan Shopify Payments y PayPal, conciliado con /diario tienda a tienda y método a método."
        acciones={<SelectorPeriodo periodo={periodo} />}
      />

      <nav aria-label="Filtrar por plataforma">
        <ul className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {FILTROS.map((f) => {
            const activo = (plataforma ?? "todos") === f.valor;
            return (
              <li key={f.valor}>
                <Link
                  href={enlaceFiltro(f.valor)}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors",
                    activo
                      ? "bg-brand text-white"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary",
                  )}
                >
                  {f.etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          destacada
          icono={Landmark}
          titulo="Cobrado en el periodo"
          subtitulo={
            resumen.numero === 0
              ? "Sin cobros en el periodo"
              : `${resumen.numero} cobro${resumen.numero === 1 ? "" : "s"} · ${destino}`
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
        <KpiCard
          icono={Wallet}
          titulo="Caja de la sociedad hoy"
          subtitulo="Banco y PayPal son de la sociedad: al margen del periodo, del filtro y de la tienda"
          valor={formatearEuros(tesoreria.cajaTotal)}
          claseValor={tesoreria.cajaTotal >= 0 ? "text-text-primary" : "text-danger"}
          desglose={[
            { etiqueta: "Banco", valor: formatearEuros(tesoreria.saldoBanco) },
            { etiqueta: "PayPal", valor: formatearEuros(tesoreria.saldoPaypal) },
            {
              etiqueta: "Pendiente de cobro (todas las tiendas)",
              valor: formatearEuros(tesoreria.pendienteTotal),
              apagado: true,
            },
          ]}
        />
      </div>

      <PanelRegistro />

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 font-medium text-danger">
            <TriangleAlert aria-hidden="true" className="size-4" />
            No se han podido cargar los cobros
          </p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </div>
      ) : ambito.tipo === "general" ? (
        <EstadoVacio
          icono={Landmark}
          titulo="General / Sociedad no tiene cobros"
          descripcion="Los cobros de Shopify Payments y PayPal son siempre de una tienda. Elige una tienda, o «Todas», en el selector para verlos."
        />
      ) : cobros.length === 0 ? (
        <EstadoVacio
          icono={Landmark}
          titulo={
            plataforma ? `No hay cobros de ${plataforma} en este periodo` : "No hay cobros en este periodo"
          }
          descripcion="Cuando Shopify Payments pague al banco o PayPal reciba un cobro, regístralo arriba con su desglose."
        />
      ) : (
        <>
          {descuadres > 0 || solapes > 0 ? (
            <div className="flex flex-col gap-1 text-sm text-warning">
              {descuadres > 0 ? (
                <p className="flex items-center gap-2">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  {descuadres === 1
                    ? "1 cobro no cuadra con las ventas de su método en /diario."
                    : `${descuadres} cobros no cuadran con las ventas de su método en /diario.`}{" "}
                  Revisa los días de su periodo.
                </p>
              ) : null}
              {solapes > 0 ? (
                <p className="flex items-center gap-2">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  {solapes === 1
                    ? "1 cobro se solapa con otro de la misma plataforma: puede estar duplicado."
                    : `${solapes} cobros se solapan con otros de la misma plataforma: pueden estar duplicados.`}
                </p>
              ) : null}
            </div>
          ) : null}
          <ListaCobros cobros={cobros} usuarioId={usuarioId ?? ""} />
        </>
      )}

      {traspasos.length > 0 ? (
        <ListaTraspasos traspasos={traspasos} usuarioId={usuarioId ?? ""} />
      ) : null}
    </div>
  );
}
