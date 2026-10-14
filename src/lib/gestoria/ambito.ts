import {
  NOMBRE_GENERAL,
  SLUG_GENERAL,
  SLUG_TODAS,
  resolverAmbito,
  type Ambito,
  type Tienda,
} from "@/lib/ambito";

/**
 * Ámbito de lo que se le manda a la gestoría (0018).
 *
 * NO es la tienda activa del selector: la gestoría lleva las cuentas de la
 * sociedad, así que por defecto se exporta el CONSOLIDADO (todas las tiendas y
 * General). Se puede pedir una tienda concreta o solo General para revisar,
 * pero el valor viaja en su propio parámetro, `?ambito=`, y nunca por defecto.
 *
 * Sin dependencias de servidor: lo usan la página, las rutas y el selector.
 */

export const PARAM_AMBITO_GESTORIA = "ambito";

export const NOMBRE_CONSOLIDADO = "Consolidado (sociedad)";

const CONSOLIDADO: Ambito = { tipo: "todas", slug: SLUG_TODAS };

/**
 * Lee el parámetro. Sin él, el consolidado. Con un slug que no existe,
 * `error`: en una exportación no se puede caer en silencio en otra tienda.
 */
export function leerAmbitoGestoria(
  valor: string | null | undefined,
  tiendas: Tienda[],
): { ambito: Ambito; error: string | null } {
  if (!valor) return { ambito: CONSOLIDADO, error: null };
  const ambito = resolverAmbito(valor, tiendas);
  if (ambito.slug !== valor) {
    return { ambito: CONSOLIDADO, error: `No existe la tienda «${valor}».` };
  }
  return { ambito, error: null };
}

/** Nombre que llevan la página, el Excel, el PDF y el LEEME. */
export function nombreAmbitoGestoria(ambito: Ambito): string {
  if (ambito.tipo === "todas") return NOMBRE_CONSOLIDADO;
  if (ambito.tipo === "general") return `${NOMBRE_GENERAL} (solo gastos compartidos)`;
  return ambito.tienda.nombre;
}

/** Sufijo de los nombres de archivo: `consolidado`, `general` o el slug. */
export function sufijoAmbitoGestoria(ambito: Ambito): string {
  if (ambito.tipo === "todas") return "consolidado";
  if (ambito.tipo === "general") return SLUG_GENERAL;
  return ambito.slug;
}
