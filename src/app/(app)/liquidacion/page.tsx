import { Suspense } from "react";
import Link from "next/link";
import { FileText, Info, TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { SelectorPeriodo } from "@/components/dashboard/selector-periodo";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { EsqueletoBloque } from "@/components/dashboard/esqueletos";
import { CascadaPrelacion } from "@/components/liquidacion/cascada-prelacion";
import { HistorialReembolsos } from "@/components/liquidacion/historial-reembolsos";
import { LimiteAportacion } from "@/components/liquidacion/limite-aportacion";
import { ResumenFinal } from "@/components/liquidacion/resumen-final";
import { TablaAnticipos } from "@/components/liquidacion/tabla-anticipos";
import { TarjetaSocio } from "@/components/liquidacion/tarjeta-socio";
import { WidgetTarjeta } from "@/components/tarjeta/widget-tarjeta";
import {
  obtenerAnticiposPendientes,
  obtenerEstadoLiquidacion,
  obtenerHistorialReembolsos,
  obtenerLiquidacionFinal,
  obtenerMovimientosCupo,
  obtenerResumenSocios,
} from "@/lib/consultas-liquidacion";
import { obtenerCupoTarjeta } from "@/lib/consultas-cupo";
import { leerPeriodo, type Periodo } from "@/lib/periodo";

export const metadata = { title: "Liquidación" };
export const revalidate = 60;

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * Liquidación entre socios. SIEMPRE global (0018): ignora el selector de
 * tienda. Anticipos, reembolsos, prorrata, cierres y liquidación final suman
 * todas las tiendas y General; las funciones SQL no reciben tienda. Cada
 * anticipo enseña de qué tienda viene, solo para saberlo.
 */
export default async function PaginaLiquidacion({
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
        alcance="global"
        titulo="Liquidación"
        descripcion="Quién ha puesto qué, qué se debe y cuándo se puede repartir."
        acciones={
          <div className="flex flex-wrap gap-2">
            <SelectorPeriodo periodo={periodo} />
            <Link
              href="/liquidacion/cierres"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
            >
              <FileText aria-hidden="true" className="size-4" />
              Cierres trimestrales
            </Link>
          </div>
        }
      />

      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <span>
          La liquidación es de la sociedad: suma todas las tiendas y General, y no
          cambia con el selector de tienda.
        </span>
      </p>

      <Suspense key={`estado-${clave}`} fallback={<EsqueletoBloque alto={420} />}>
        <BloqueEstado periodo={periodo} />
      </Suspense>

      <Suspense key={`cascada-${clave}`} fallback={<EsqueletoBloque alto={520} />}>
        <BloqueCascada periodo={periodo} />
      </Suspense>

      <Suspense key={`anticipos-${clave}`} fallback={<EsqueletoBloque alto={380} />}>
        <BloqueAnticipos />
      </Suspense>
    </div>
  );
}

/** Secciones 1 y 2: estado por socio y cupo de la tarjeta. */
async function BloqueEstado({ periodo }: { periodo: Periodo }) {
  void periodo;

  // R6: el cupo mide lo pagado con la tarjeta (medio_pago = tarjeta_daniel),
  // de todas las tiendas y de General. El widget lo mantiene en tiempo real.
  const [socios, liquidacion, cupo, ultimos] = await Promise.all([
    obtenerResumenSocios(),
    obtenerLiquidacionFinal(),
    obtenerCupoTarjeta(),
    obtenerMovimientosCupo(5),
  ]);

  const hayCupo = cupo.limite > 0 || cupo.num_gastos > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TarjetaBloque
        titulo="Estado actual"
        descripcion="Lo que cada socio ha puesto, con la tarjeta o de su bolsillo, en todas las tiendas."
        className={hayCupo ? "lg:col-span-2" : "lg:col-span-3"}
      >
        <div className="flex flex-col gap-4">
          {socios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
              Todavía no hay socios activos dados de alta.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {socios.map((socio) => (
                <TarjetaSocio key={socio.socio_id} socio={socio} />
              ))}
            </div>
          )}

          <ResumenFinal liquidacion={liquidacion} socios={socios} />
        </div>
      </TarjetaBloque>

      {hayCupo ? (
        <div className="flex flex-col gap-4">
          <WidgetTarjeta inicial={cupo} />
          <TarjetaBloque
            titulo="Límite de aportación"
            descripcion="Regla 6 del contrato. El cupo lo consume todo lo pagado con la tarjeta, sea de la tienda que sea."
          >
            <LimiteAportacion
              socios={socios}
              movimientos={ultimos.movimientos}
              totalMovimientos={ultimos.total}
            />
          </TarjetaBloque>
        </div>
      ) : null}
    </div>
  );
}

/** Sección 3: la cascada de prelación. */
async function BloqueCascada({ periodo }: { periodo: Periodo }) {
  const estado = await obtenerEstadoLiquidacion(periodo.hasta);

  if (!estado) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
        <p className="flex items-center gap-2 font-medium text-danger">
          <TriangleAlert aria-hidden="true" className="size-4" />
          No se ha podido calcular la liquidación
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Comprueba que las migraciones 0004 a 0007 están aplicadas.
        </p>
      </div>
    );
  }

  return (
    <TarjetaBloque
      titulo="Orden de prelación"
      descripcion="Regla 3: a qué se destinan los ingresos, y en qué orden."
    >
      <CascadaPrelacion estado={estado} />
    </TarjetaBloque>
  );
}

/** Sección 4: anticipos pendientes e historial. */
async function BloqueAnticipos() {
  const [anticipos, socios, historial] = await Promise.all([
    obtenerAnticiposPendientes(),
    obtenerResumenSocios(),
    obtenerHistorialReembolsos(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <TarjetaBloque
        titulo="Anticipos pendientes"
        descripcion="De lo más antiguo a lo más reciente: ese es el orden en el que toca devolver."
      >
        <TablaAnticipos anticipos={anticipos} socios={socios} />
      </TarjetaBloque>

      <HistorialReembolsos reembolsos={historial} />
    </div>
  );
}
