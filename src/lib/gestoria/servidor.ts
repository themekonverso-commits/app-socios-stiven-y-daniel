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
import {
  PARAM_AMBITO_GESTORIA,
  leerAmbitoGestoria,
  nombreAmbitoGestoria,
  sufijoAmbitoGestoria,
} from "@/lib/gestoria/ambito";
import { obtenerTiendas } from "@/lib/tiendas";
import type { Ambito } from "@/lib/ambito";

/**
 * Lo que las tres rutas de exportación hacen igual: comprobar la sesión, leer
 * el trimestre y el ámbito de la query y cargar los datos. Escrito una vez
 * para que las tres exporten exactamente lo mismo.
 *
 * `?ambito=todas|general|<slug>`; sin él, el consolidado de la sociedad.
 */

export type Contexto = {
  clave: string;
  etiqueta: string;
  ambito: Ambito;
  /** «Consolidado (sociedad)», «General / Sociedad (…)» o el nombre de la tienda. */
  nombreAmbito: string;
  /** Para los nombres de archivo: `gestoria-2026-Q3-consolidado.zip`. */
  sufijo: string;
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

  const { ambito, error: errorAmbito } = leerAmbitoGestoria(
    parametros.get(PARAM_AMBITO_GESTORIA),
    await obtenerTiendas(),
  );
  if (errorAmbito) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: errorAmbito }, { status: 400 }),
    };
  }

  const { desde, hasta } = limitesTrimestre(trimestre);
  const [filas, resumen] = await Promise.all([
    obtenerLibro(desde, hasta, ambito),
    obtenerResumenIva(desde, hasta, ambito),
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
      ambito,
      nombreAmbito: nombreAmbitoGestoria(ambito),
      sufijo: sufijoAmbitoGestoria(ambito),
      desde,
      hasta,
      filas,
      resumen,
    },
  };
}

/**
 * El cierre aprobado del periodo, con los nombres de los socios resueltos. Es
 * de la sociedad: va igual en cualquier ámbito.
 */
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
