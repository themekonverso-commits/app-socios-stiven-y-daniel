import "server-only";

import { NextResponse } from "next/server";

import {
  obtenerCierreDelPeriodo,
  obtenerLibro,
  obtenerResumenIva,
  type FilaLibro,
  type ResumenIva,
} from "@/lib/consultas-gestoria";
import { obtenerSocios } from "@/lib/consultas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { etiquetaTrimestre, limitesTrimestre, parsearClave } from "@/lib/gestoria/periodos";

/**
 * Lo que las tres rutas de exportación hacen igual: comprobar la sesión, leer
 * el trimestre de la query y cargar los datos. Escrito una vez para que las
 * tres exporten exactamente lo mismo.
 */

export type Contexto = {
  clave: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  filas: FilaLibro[];
  resumen: ResumenIva;
};

export async function prepararExportacion(
  parametros: URLSearchParams,
): Promise<{ ok: true; contexto: Contexto } | { ok: false; respuesta: NextResponse }> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const trimestre = parsearClave(parametros.get("trimestre"));
  if (!trimestre) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "Falta el trimestre o tiene un formato inválido (AAAA-QN)." },
        { status: 400 },
      ),
    };
  }

  const { desde, hasta } = limitesTrimestre(trimestre);
  const [filas, resumen] = await Promise.all([
    obtenerLibro(desde, hasta),
    obtenerResumenIva(desde, hasta),
  ]);

  if (!resumen) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "No se pudo calcular el resumen de IVA del periodo." },
        { status: 500 },
      ),
    };
  }

  return {
    ok: true,
    contexto: {
      clave: `${trimestre.anio}-Q${trimestre.numero}`,
      etiqueta: etiquetaTrimestre(trimestre),
      desde,
      hasta,
      filas,
      resumen,
    },
  };
}

/** El cierre aprobado del periodo, con los nombres de los socios resueltos. */
export async function cargarActa(desde: string, hasta: string) {
  const cierre = await obtenerCierreDelPeriodo(desde, hasta);
  if (!cierre) return null;

  const socios = await obtenerSocios();
  const nombrePorSocio = Object.fromEntries(socios.map((s) => [s.id, s.nombre]));

  return {
    ...(cierre as unknown as import("@/lib/tipos-liquidacion").Cierre),
    nombrePorSocio,
  };
}
