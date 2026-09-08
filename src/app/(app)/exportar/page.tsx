import { AlertTriangle, FileArchive, FileSpreadsheet, FileText } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { TarjetaBloque } from "@/components/dashboard/tarjeta";
import { PanelCuadre } from "@/components/exportar/panel-cuadre";
import { SelectorTrimestre } from "@/components/exportar/selector-trimestre";
import {
  obtenerCierreDelPeriodo,
  obtenerLibro,
  obtenerResumenIva,
} from "@/lib/consultas-gestoria";
import { obtenerAjustes } from "@/lib/consultas-kpi";
import {
  claveTrimestre,
  etiquetaTrimestre,
  limitesTrimestre,
  parsearClave,
  trimestresDisponibles,
  ultimoTrimestreCerrado,
} from "@/lib/gestoria/periodos";
import { formatearEntero, formatearEuros, formatearFecha } from "@/lib/formato";

export const metadata = { title: "Exportar" };

export default async function PaginaExportar({
  searchParams,
}: {
  searchParams: Promise<{ trimestre?: string }>;
}) {
  const { trimestre: pedido } = await searchParams;
  const { saldoInicial } = await obtenerAjustes();

  const hoy = new Date().toISOString().slice(0, 10);
  // Por defecto, el último trimestre CERRADO: es el que se presenta.
  const seleccionado = parsearClave(pedido) ?? ultimoTrimestreCerrado(hoy);
  const clave = claveTrimestre(seleccionado);
  const etiqueta = etiquetaTrimestre(seleccionado);
  const { desde, hasta } = limitesTrimestre(seleccionado);

  const opciones = trimestresDisponibles(saldoInicial.fecha, hoy).map((o) => ({
    clave: claveTrimestre(o.trimestre),
    etiqueta: etiquetaTrimestre(o.trimestre),
    enCurso: o.enCurso,
  }));
  // Si la URL pide un trimestre fuera de la lista, se añade para no perderlo.
  if (!opciones.some((o) => o.clave === clave)) {
    opciones.unshift({ clave, etiqueta, enCurso: false });
  }

  const [resumen, filas, cierre] = await Promise.all([
    obtenerResumenIva(desde, hasta),
    obtenerLibro(desde, hasta),
    obtenerCierreDelPeriodo(desde, hasta),
  ]);

  const enCurso = opciones.find((o) => o.clave === clave)?.enCurso ?? false;
  const query = `?trimestre=${clave}`;

  const descargas = [
    {
      href: `/api/exportar/paquete${query}`,
      icono: FileArchive,
      titulo: "Paquete completo (ZIP)",
      detalle: `gestoria-${clave}.zip · libro en Excel y CSV, resumen de IVA y ${cierre ? "acta del cierre" : "sin acta (no hay cierre aprobado)"}`,
      principal: true,
    },
    {
      href: `/api/exportar/libro${query}`,
      icono: FileSpreadsheet,
      titulo: "Libro de ingresos y gastos (Excel)",
      detalle: `libro-${clave}.xlsx · una hoja por tipo y subtotales por IVA`,
      principal: false,
    },
    {
      href: `/api/exportar/iva${query}`,
      icono: FileText,
      titulo: "Resumen de IVA (PDF)",
      detalle: `resumen-iva-${clave}.pdf · documento de apoyo, no es un modelo oficial`,
      principal: false,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Exportar para la gestoría"
        descripcion="El trimestre entero en los formatos que suele pedir un asesor fiscal."
      />

      {/* La advertencia, arriba del todo y en la misma página, no solo en el PDF. */}
      <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-danger">
            Documento de apoyo. No es un modelo oficial.
          </p>
          <p className="mt-1 text-text-secondary">
            Nada de lo que se descarga aquí sirve para presentar directamente ante
            la Agencia Tributaria. Es material para que lo revise la gestoría:
            ella decide qué va en cada modelo.
          </p>
        </div>
      </div>

      <TarjetaBloque
        titulo="Periodo"
        descripcion={`Del ${formatearFecha(desde)} al ${formatearFecha(hasta)} · ${formatearEntero(filas.length)} ${filas.length === 1 ? "movimiento" : "movimientos"}`}
      >
        {/* El selector va en el cuerpo, no en la cabecera: a 375 px aplastaba
            el título contra el borde de la tarjeta. */}
        <SelectorTrimestre opciones={opciones} valor={clave} />

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {enCurso ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-medium text-warning">
              Trimestre en curso: aún faltan movimientos por registrar
            </span>
          ) : null}
          {cierre ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 font-medium text-success">
              Cierre aprobado: el acta va dentro del ZIP
            </span>
          ) : (
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-text-secondary">
              Sin cierre aprobado para este periodo: el ZIP irá sin acta
            </span>
          )}
        </div>
      </TarjetaBloque>

      {resumen ? (
        <>
          <TarjetaBloque
            titulo="Cuadre por tipo de IVA"
            descripcion="Se comprueba antes de descargar nada: los subtotales por tipo tienen que sumar el total general, al céntimo."
          >
            <div className="flex flex-col gap-8">
              <PanelCuadre
                titulo="IVA repercutido (ingresos)"
                bloque={resumen.ingresos}
                cuadre={resumen.cuadre.ingresos}
              />
              <PanelCuadre
                titulo="IVA soportado (gastos)"
                bloque={resumen.gastos}
                cuadre={resumen.cuadre.gastos}
              />
            </div>

            <div className="mt-6 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">IVA repercutido</span>
                <span className="tabular-nums text-text-primary">
                  {formatearEuros(resumen.iva_repercutido)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">IVA soportado</span>
                <span className="tabular-nums text-text-primary">
                  {formatearEuros(resumen.iva_soportado)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="font-semibold text-text-primary">
                  Diferencia {resumen.diferencia >= 0 ? "a ingresar" : "a compensar"}
                </span>
                <span className="text-lg font-semibold tabular-nums text-text-primary">
                  {formatearEuros(Math.abs(resumen.diferencia))}
                </span>
              </div>
            </div>
          </TarjetaBloque>

          <TarjetaBloque
            titulo="Descargas"
            descripcion="Los tres formatos salen de la misma consulta, así que no pueden discrepar entre ellos."
          >
            <ul className="flex flex-col gap-2">
              {descargas.map((d) => (
                <li key={d.href}>
                  <a
                    href={d.href}
                    className={
                      d.principal
                        ? "flex min-h-11 items-center gap-3 rounded-lg border border-brand/40 bg-brand/10 p-3 transition-colors hover:bg-brand/15"
                        : "flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 transition-colors hover:bg-surface"
                    }
                  >
                    <d.icono
                      aria-hidden="true"
                      className={d.principal ? "size-5 shrink-0 text-brand" : "size-5 shrink-0 text-text-secondary"}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">
                        {d.titulo}
                      </span>
                      <span className="block truncate text-xs text-text-secondary">
                        {d.detalle}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </TarjetaBloque>
        </>
      ) : (
        <TarjetaBloque titulo="Cuadre por tipo de IVA">
          <p className="text-sm text-danger">
            No se pudo calcular el resumen de IVA del periodo. No descargues nada
            hasta que esto se resuelva.
          </p>
        </TarjetaBloque>
      )}
    </div>
  );
}
