import { Archive, CalendarPlus, TriangleAlert } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { AvisoRevisionMetodos } from "@/components/diario/aviso-revision-metodos";
import { FormularioDiario } from "@/components/diario/formulario-diario";
import { TablaDiario } from "@/components/diario/tabla-diario";
import { AvisoElegirTienda } from "@/components/movimientos/aviso-elegir-tienda";
import {
  obtenerCoberturaVentas,
  obtenerRevisionMetodos,
  obtenerUltimaTasa,
  obtenerVentasDiarias,
} from "@/lib/consultas";
import { obtenerAmbito } from "@/lib/tiendas";

export const metadata = { title: "Registro diario" };

/**
 * Registro diario de ventas. Siempre es de UNA tienda: las ventas se apuntan
 * en la tienda activa. En «Todas» se puede consultar la tabla de todas, pero
 * para registrar hay que elegir tienda; en «General» no hay ventas que ver
 * (un ingreso siempre es de una tienda).
 */
export default async function PaginaRegistroDiario() {
  const ambito = await obtenerAmbito();

  if (ambito.tipo === "general") {
    return (
      <div className="flex flex-col gap-5">
        <EncabezadoPagina
          titulo="Registro diario"
          descripcion="Las ventas del día por método de cobro, en menos de veinte segundos."
        />
        <AvisoElegirTienda
          titulo="Elige una tienda para ver y registrar sus ventas"
          descripcion="Las ventas siempre son de una tienda concreta."
        />
      </div>
    );
  }

  const [{ filas, error }, ultimaTasa, cobertura, revision] = await Promise.all([
    obtenerVentasDiarias(30, ambito),
    obtenerUltimaTasa(),
    obtenerCoberturaVentas(30, ambito),
    // El aviso de la 0017 es de los días de antes del desglose, todos de la
    // primera tienda: solo se enseña dentro de una tienda que los tenga.
    ambito.tipo === "tienda" ? obtenerRevisionMetodos(ambito) : Promise.resolve(null),
  ]);

  const tienda = ambito.tipo === "tienda" ? ambito.tienda : null;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Registro diario"
        descripcion={
          tienda
            ? "Las ventas del día por método de cobro, en menos de veinte segundos."
            : "Las ventas de los últimos 30 días de todas las tiendas."
        }
      />

      {revision && tienda ? (
        <AvisoRevisionMetodos dias={revision.dias} nombreTienda={tienda.nombre} />
      ) : null}

      {!tienda ? (
        <AvisoElegirTienda
          titulo="Elige una tienda para registrar sus ventas"
          descripcion="Las ventas del día se apuntan siempre en una tienda concreta. Abajo tienes las de todas."
        />
      ) : tienda.estado === "archivada" ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <p>
            <span className="font-medium text-text-primary">{tienda.nombre}</span> está
            archivada: no admite ventas nuevas. Su historial sigue aquí abajo.
          </p>
        </div>
      ) : (
        // La clave reinicia el formulario al cambiar de tienda: no se arrastra
        // lo escrito para otra.
        <FormularioDiario
          key={tienda.id}
          tienda={{ id: tienda.id, nombre: tienda.nombre }}
          ultimaTasa={ultimaTasa}
        />
      )}

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="flex items-center gap-2 font-medium text-danger">
            <TriangleAlert aria-hidden="true" className="size-4" />
            No se ha podido cargar el registro
          </p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </div>
      ) : filas.length === 0 ? (
        <EstadoVacio
          icono={CalendarPlus}
          titulo={
            tienda
              ? `${tienda.nombre} no tiene ventas en los últimos 30 días`
              : "Ninguna tienda tiene ventas en los últimos 30 días"
          }
          descripcion={
            tienda
              ? tienda.estado === "archivada"
                ? "No hay nada reciente que enseñar."
                : "Registra el primer día con el formulario de arriba: pedidos e importe de cada método de cobro."
              : "Elige una tienda arriba y registra su primer día."
          }
        />
      ) : (
        <TablaDiario filas={filas} cobertura={cobertura} conTienda={!tienda} />
      )}
    </div>
  );
}
