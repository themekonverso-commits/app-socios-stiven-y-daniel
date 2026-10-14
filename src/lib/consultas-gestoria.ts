import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import { SLUG_TODAS, argsAmbito, filtrarPorAmbito, type Ambito } from "@/lib/ambito";

/**
 * Datos para la gestoría.
 *
 * Todo sale de `fn_resumen_iva` y de `vw_libro_gestoria`: el cálculo del IVA se
 * hace en Postgres, en un solo sitio, y los tres formatos de salida (Excel, PDF
 * y ZIP) leen exactamente los mismos números. Si el Excel y el PDF no
 * coincidieran, el problema sería de la gestoría, no nuestro.
 *
 * Ámbito (0018): las dos lecturas reciben el mismo ámbito como último
 * parámetro. Sin él, el CONSOLIDADO de la sociedad (todas las tiendas y
 * General), que es lo que se presenta. Libro e IVA filtran con la misma regla
 * (`fn_en_ambito` en SQL, `filtrarPorAmbito` aquí), así que siguen cuadrando.
 */

const CONSOLIDADO: Ambito = { tipo: "todas", slug: SLUG_TODAS };

export type TramoIva = {
  tipo_iva: number | null;
  operaciones: number;
  base: number;
  cuota: number;
  total: number;
};

export type BloqueIva = {
  por_tipo: TramoIva[];
  operaciones: number;
  base: number;
  cuota: number;
  total: number;
};

export type Cuadre = {
  suma_subtotales_base: number;
  suma_subtotales_cuota: number;
  suma_subtotales_total: number;
  total_general_base: number;
  total_general_cuota: number;
  total_general_total: number;
  descuadre_base: number;
  descuadre_cuota: number;
  descuadre_total: number;
  cuadra: boolean;
  hay_tipos_no_estandar: boolean;
};

export type ResumenIva = {
  desde: string;
  hasta: string;
  ingresos: BloqueIva;
  gastos: BloqueIva;
  iva_repercutido: number;
  iva_soportado: number;
  diferencia: number;
  cuadre: { ingresos: Cuadre; gastos: Cuadre };
};

export type FilaLibro = {
  id: string;
  fecha: string;
  tipo: "ingreso" | "gasto";
  concepto: string;
  categoria: string;
  divisa: string;
  base_imponible: number;
  iva_tipo: number;
  iva_importe: number;
  total: number;
  tasa_cambio: number;
  base_eur: number;
  cuota_eur: number;
  total_eur: number;
  anticipado_por: string | null;
  notas: string | null;
  tienda_id: string | null;
  /** Nombre de la tienda, o «General / Sociedad». */
  tienda: string;
  /** Solo en gastos: tarjeta_daniel | bolsillo | banco | paypal. */
  medio_pago: string | null;
};

export async function obtenerResumenIva(
  desde: string,
  hasta: string,
  ambito: Ambito = CONSOLIDADO,
): Promise<ResumenIva | null> {
  const supabase = await crearClienteServidor();
  const { p_tienda, p_solo_general } = argsAmbito(ambito);
  const { data, error } = await supabase.rpc("fn_resumen_iva", {
    p_desde: desde,
    p_hasta: hasta,
    // Los tipos generados no admiten null, pero la función sí: null = todas.
    p_tienda: p_tienda as string,
    p_solo_general,
  });

  if (error || !data) return null;
  return data as unknown as ResumenIva;
}

export async function obtenerLibro(
  desde: string,
  hasta: string,
  ambito: Ambito = CONSOLIDADO,
): Promise<FilaLibro[]> {
  const supabase = await crearClienteServidor();

  const consulta = supabase
    .from("vw_libro_gestoria")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  const { data, error } = await filtrarPorAmbito(consulta, ambito)
    .order("fecha", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) return [];
  return data as unknown as FilaLibro[];
}

/**
 * El acta del cierre del periodo, si existe y está aprobada. Los cierres son
 * de la sociedad: no dependen del ámbito.
 */
export async function obtenerCierreDelPeriodo(desde: string, hasta: string) {
  const supabase = await crearClienteServidor();

  const { data } = await supabase
    .from("cierres")
    .select("*")
    .eq("periodo_inicio", desde)
    .eq("periodo_fin", hasta)
    .eq("estado", "aprobado")
    .maybeSingle();

  return data ?? null;
}
