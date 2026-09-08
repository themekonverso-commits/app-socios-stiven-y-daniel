import { Suspense } from "react";
import { ArrowLeftRight, SearchX, TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { BarraFiltros } from "@/components/movimientos/barra-filtros";
import { BotonExportar } from "@/components/movimientos/boton-exportar";
import { BotonNuevoMovimiento } from "@/components/movimientos/boton-nuevo-movimiento";
import { EsqueletoMovimientos } from "@/components/movimientos/esqueleto-movimientos";
import { ListaMovimientos } from "@/components/movimientos/lista-movimientos";
import { Paginacion } from "@/components/movimientos/paginacion";
import { TiraTotales } from "@/components/movimientos/tira-totales";
import {
  obtenerCategorias,
  obtenerMovimientos,
  obtenerSocios,
  obtenerTotales,
} from "@/lib/consultas";
import { hayFiltrosActivos, leerFiltros } from "@/lib/esquemas/filtros";

export const metadata = { title: "Movimientos" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaMovimientos({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const filtros = leerFiltros(params);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Movimientos"
        descripcion="Todos los ingresos y gastos registrados."
        acciones={
          <div className="flex flex-wrap gap-2">
            <BotonExportar filtros={filtros} />
            <BotonNuevoMovimiento />
          </div>
        }
      />

      {/* La clave fuerza a Suspense a mostrar el esqueleto en cada cambio de
          filtro, no solo en la primera carga. */}
      <Suspense
        key={JSON.stringify(params)}
        fallback={<EsqueletoMovimientos />}
      >
        <ContenidoMovimientos params={params} />
      </Suspense>
    </div>
  );
}

async function ContenidoMovimientos({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const filtros = leerFiltros(params);

  const [resultado, totales, categorias, socios] = await Promise.all([
    obtenerMovimientos(filtros),
    obtenerTotales(filtros),
    obtenerCategorias(),
    obtenerSocios(),
  ]);

  if (resultado.error) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
        <p className="flex items-center gap-2 font-medium text-danger">
          <TriangleAlert aria-hidden="true" className="size-4" />
          No se han podido cargar los movimientos
        </p>
        <p className="mt-1 text-sm text-text-secondary">{resultado.error}</p>
        <p className="mt-2 text-sm text-text-secondary">
          Si es la primera vez que abres la aplicación, ejecuta{" "}
          <code className="rounded bg-surface-2 px-1">
            supabase/migrations/0001_init.sql
          </code>{" "}
          en el SQL Editor de Supabase.
        </p>
      </div>
    );
  }

  const conFiltros = hayFiltrosActivos(filtros);

  return (
    <>
      <BarraFiltros filtros={filtros} categorias={categorias} socios={socios} />

      <TiraTotales totales={totales} />

      {resultado.filas.length === 0 ? (
        conFiltros ? (
          <EstadoVacio
            icono={SearchX}
            titulo="Ningún movimiento con estos filtros"
            descripcion="Prueba a ampliar el rango de fechas o a quitar algún filtro."
            accion={
              <a
                href="/movimientos"
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2"
              >
                Limpiar filtros
              </a>
            }
          />
        ) : (
          <EstadoVacio
            icono={ArrowLeftRight}
            titulo="Todavía no hay movimientos"
            descripcion="Registra el primer ingreso o gasto y aparecerá aquí."
            accion={<BotonNuevoMovimiento etiqueta="Crear el primero" />}
          />
        )
      ) : (
        <>
          <ListaMovimientos filas={resultado.filas} filtros={filtros} />
          <Paginacion
            filtros={filtros}
            total={resultado.total}
            paginas={resultado.paginas}
          />
        </>
      )}
    </>
  );
}
