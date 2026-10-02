import { Suspense } from "react";
import Link from "next/link";
import { FileText, TriangleAlert } from "lucide-react";

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
import {
  obtenerAnticiposPendientes,
  obtenerEstadoLiquidacion,
  obtenerHistorialReembolsos,
  obtenerLimiteAportacion,
  obtenerLiquidacionFinal,
  obtenerMovimientosCupo,
  obtenerResumenSocios,
} from "@/lib/consultas-liquidacion";
import { escribirFiltros } from "@/lib/esquemas/filtros";
import { hoyEnEspana, leerPeriodo, type Periodo } from "@/lib/periodo";
import { format } from "date-fns";

export const metadata = { title: "Liquidación" };
export const revalidate = 60;

type Params = Promise<Record<string, string | string[] | undefined>>;

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

/** Secciones 1 y 2: estado por socio y límite de aportación. */
async function BloqueEstado({ periodo }: { periodo: Periodo }) {
  void periodo;

  const [socios, liquidacion, { limite, avisoPct }] = await Promise.all([
    obtenerResumenSocios(),
    obtenerLiquidacionFinal(),
    obtenerLimiteAportacion(),
  ]);

  // R6: si no se ha designado socio, el cupo se vigila sobre quien más lo ha
  // consumido —no sobre quien más ha adelantado en total—, que es a quien
  // afecta la conversación de continuidad.
  const socioLimite = limite.socio_id
    ? socios.find((s) => s.socio_id === limite.socio_id)
    : [...socios].sort((a, b) => b.anticipado_cupo - a.anticipado_cupo)[0];

  const hayLimite = limite.importe > 0 && socioLimite !== undefined;

  // Lo que ha ido consumiendo la tarjeta, con enlace al listado completo ya
  // filtrado: ese socio, las categorías del cupo y desde el primer gasto.
  const categoriaIds = limite.categorias.map((c) => c.id);
  const cupo =
    hayLimite && socioLimite
      ? await obtenerMovimientosCupo(socioLimite.socio_id, categoriaIds, 5)
      : null;
  const enlaceCupo =
    cupo && socioLimite && cupo.desde
      ? `/movimientos?${escribirFiltros({
          preset: "personalizado",
          desde: cupo.desde,
          hasta: format(hoyEnEspana(), "yyyy-MM-dd"),
          categorias: categoriaIds,
          anticipado: socioLimite.socio_id,
        })}`
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TarjetaBloque
        titulo="Estado actual"
        descripcion="Lo que cada socio ha puesto de su bolsillo."
        className={hayLimite ? "lg:col-span-2" : "lg:col-span-3"}
      >
        <div className="flex flex-col gap-4">
          {socios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
              Todavía no hay socios activos dados de alta.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {socios.map((socio) => (
                <TarjetaSocio
                  key={socio.socio_id}
                  socio={socio}
                  ambito={limite.ambito}
                />
              ))}
            </div>
          )}

          <ResumenFinal liquidacion={liquidacion} socios={socios} />
        </div>
      </TarjetaBloque>

      {hayLimite && socioLimite ? (
        <TarjetaBloque
          titulo="Límite de aportación"
          descripcion={
            limite.ambito
              ? `Regla 6 del contrato. La tarjeta cubre ${limite.ambito}.`
              : "Regla 6 del contrato."
          }
        >
          <LimiteAportacion
            socio={socioLimite}
            limite={limite.importe}
            avisoPct={avisoPct}
            ambito={limite.ambito}
            movimientos={cupo?.movimientos ?? []}
            totalMovimientos={cupo?.total ?? 0}
            enlaceMovimientos={enlaceCupo}
          />
        </TarjetaBloque>
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
