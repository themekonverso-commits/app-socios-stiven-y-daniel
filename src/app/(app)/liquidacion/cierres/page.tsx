import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { AsistenteCierre } from "@/components/liquidacion/asistente-cierre";
import { TarjetaCierre } from "@/components/liquidacion/tarjeta-cierre";
import {
  obtenerCierres,
  obtenerResumenSocios,
  obtenerUsuarioActual,
} from "@/lib/consultas-liquidacion";
import { obtenerAjustes } from "@/lib/consultas-kpi";
import { primeroSinCerrar } from "@/lib/trimestres";

export const metadata = { title: "Cierres trimestrales" };

export default async function PaginaCierres() {
  const [cierres, socios, usuarioId, { saldoInicial }] = await Promise.all([
    obtenerCierres(),
    obtenerResumenSocios(),
    obtenerUsuarioActual(),
    obtenerAjustes(),
  ]);

  // La fecha del saldo inicial marca el arranque del negocio: no tiene sentido
  // proponer el cierre de un trimestre anterior a que existiera.
  const propuesto = primeroSinCerrar(cierres, new Date(), saldoInicial.fecha);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Cierres trimestrales"
        descripcion="El acta de cada reunión: cifras, decisión de reparto y las dos firmas."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/liquidacion"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Liquidación
            </Link>
            <AsistenteCierre socios={socios} propuesto={propuesto} />
          </div>
        }
      />

      {cierres.length === 0 ? (
        <EstadoVacio
          icono={FileText}
          titulo="Todavía no hay ningún cierre"
          descripcion={`El siguiente trimestre por cerrar es ${propuesto.etiqueta}. El asistente calcula las cifras y las deja listas para que las firméis los dos.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {cierres.map((cierre) => (
            <TarjetaCierre
              key={cierre.id}
              cierre={cierre}
              socios={socios}
              usuarioId={usuarioId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
