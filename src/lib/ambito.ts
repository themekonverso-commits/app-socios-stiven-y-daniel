/**
 * Ámbito de la vista: una tienda concreta, «Todas las tiendas» o «General /
 * Sociedad» (los gastos compartidos, que no son de ninguna tienda).
 *
 * El valor vive en DOS sitios a la vez, y el middleware los mantiene iguales:
 *   · el parámetro `?tienda=` de la URL, para que un enlace compartido abra la
 *     tienda correcta;
 *   · la cookie `tienda`, para recordarla entre visitas.
 * Los Server Components leen la cookie (`obtenerAmbito()` en lib/tiendas.ts) y
 * los componentes de cliente leen la URL (`useAmbito()`).
 *
 * Este archivo no importa nada de servidor: lo usan los dos lados.
 */

export const COOKIE_TIENDA = "tienda";
export const PARAM_TIENDA = "tienda";

export const SLUG_TODAS = "todas";
export const SLUG_GENERAL = "general";

export const NOMBRE_TODAS = "Todas las tiendas";
export const NOMBRE_GENERAL = "General / Sociedad";

/** Colores de los dos ámbitos que no son tiendas. Neutros a propósito. */
export const COLOR_TODAS = "#A1A1AA";
export const COLOR_GENERAL = "#71717A";

/** Paleta que propone el diálogo de nueva tienda. */
export const COLORES_TIENDA = [
  "#74A5A2",
  "#F2551E",
  "#A458A7",
  "#3B82F6",
  "#22C55E",
  "#EAB308",
  "#EC4899",
  "#14B8A6",
] as const;

export type EstadoTienda = "activa" | "pausada" | "archivada";

export type ObjetivoMes = { facturacion: number; beneficio: number };

export type Tienda = {
  id: string;
  nombre: string;
  slug: string;
  color: string;
  estado: EstadoTienda;
  url_shopify: string | null;
  fecha_lanzamiento: string | null;
  objetivo_mes: ObjetivoMes;
  notas: string | null;
  created_by: string;
};

export type Ambito =
  | { tipo: "todas"; slug: typeof SLUG_TODAS }
  | { tipo: "general"; slug: typeof SLUG_GENERAL }
  | { tipo: "tienda"; slug: string; tienda: Tienda };

/** Formato admitido en la cookie y en la URL. Lo demás se ignora. */
const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function esSlugValido(valor: string | null | undefined): valor is string {
  return !!valor && valor.length <= 60 && SLUG_VALIDO.test(valor);
}

/**
 * La tienda por defecto cuando no hay nada elegido: la primera activa por
 * fecha de lanzamiento. Sin tiendas activas, «Todas».
 */
export function slugPorDefecto(tiendas: Tienda[]): string {
  const activa = tiendas.find((t) => t.estado === "activa");
  return activa?.slug ?? SLUG_TODAS;
}

/** Traduce el valor guardado (cookie o URL) a un ámbito. Nunca falla. */
export function resolverAmbito(
  valor: string | null | undefined,
  tiendas: Tienda[],
): Ambito {
  const slug = esSlugValido(valor) ? valor : slugPorDefecto(tiendas);
  if (slug === SLUG_TODAS) return { tipo: "todas", slug: SLUG_TODAS };
  if (slug === SLUG_GENERAL) return { tipo: "general", slug: SLUG_GENERAL };

  const tienda = tiendas.find((t) => t.slug === slug);
  if (tienda) return { tipo: "tienda", slug, tienda };

  // Un slug que ya no existe (tienda renombrada, enlace viejo): la de defecto.
  const defecto = slugPorDefecto(tiendas);
  const tiendaDefecto = tiendas.find((t) => t.slug === defecto);
  return tiendaDefecto
    ? { tipo: "tienda", slug: defecto, tienda: tiendaDefecto }
    : { tipo: "todas", slug: SLUG_TODAS };
}

/**
 * Parámetros de las funciones SQL por tienda (migración 0018):
 *   todas   → p_tienda null, p_solo_general false
 *   general → p_tienda null, p_solo_general true
 *   tienda  → p_tienda = id
 */
export function argsAmbito(ambito: Ambito): {
  p_tienda: string | null;
  p_solo_general: boolean;
} {
  if (ambito.tipo === "tienda") return { p_tienda: ambito.tienda.id, p_solo_general: false };
  return { p_tienda: null, p_solo_general: ambito.tipo === "general" };
}

/** La tienda concreta del ámbito, o null en «Todas» y «General». */
export function tiendaDelAmbito(ambito: Ambito): Tienda | null {
  return ambito.tipo === "tienda" ? ambito.tienda : null;
}

export function nombreAmbito(ambito: Ambito): string {
  if (ambito.tipo === "todas") return NOMBRE_TODAS;
  if (ambito.tipo === "general") return NOMBRE_GENERAL;
  return ambito.tienda.nombre;
}

export function colorAmbito(ambito: Ambito): string {
  if (ambito.tipo === "todas") return COLOR_TODAS;
  if (ambito.tipo === "general") return COLOR_GENERAL;
  return ambito.tienda.color;
}

/** Nombre de la tienda de una fila (tienda_id NULL = General). */
export function nombreTienda(tiendaId: string | null, tiendas: Tienda[]): string {
  if (!tiendaId) return NOMBRE_GENERAL;
  return tiendas.find((t) => t.id === tiendaId)?.nombre ?? "Tienda desconocida";
}

export function colorTienda(tiendaId: string | null, tiendas: Tienda[]): string {
  if (!tiendaId) return COLOR_GENERAL;
  return tiendas.find((t) => t.id === tiendaId)?.color ?? COLOR_GENERAL;
}

/**
 * Añade (o sustituye) `?tienda=` en un href interno. Así los enlaces llevan
 * la tienda y el middleware no tiene que redirigir.
 */
export function conTienda(href: string, slug: string): string {
  const [ruta, hash] = href.split("#");
  const [camino, query = ""] = ruta.split("?");
  const params = new URLSearchParams(query);
  params.set(PARAM_TIENDA, slug);
  return `${camino}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

/** Convierte un nombre en slug: «The Glow Co Spain» → «the-glow-co-spain». */
export function slugDeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Normaliza la fila de la base de datos. `objetivo_mes` es jsonb: se valida
 * aquí para que el resto de la app pueda fiarse de los números.
 */
export function aTienda(fila: {
  id: string;
  nombre: string;
  slug: string;
  color: string;
  estado: string;
  url_shopify: string | null;
  fecha_lanzamiento: string | null;
  objetivo_mes: unknown;
  notas: string | null;
  created_by: string;
}): Tienda {
  const objetivo = (fila.objetivo_mes ?? {}) as Record<string, unknown>;
  const numero = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id: fila.id,
    nombre: fila.nombre,
    slug: fila.slug,
    color: fila.color,
    estado: (["activa", "pausada", "archivada"].includes(fila.estado)
      ? fila.estado
      : "activa") as EstadoTienda,
    url_shopify: fila.url_shopify,
    fecha_lanzamiento: fila.fecha_lanzamiento,
    objetivo_mes: {
      facturacion: numero(objetivo.facturacion),
      beneficio: numero(objetivo.beneficio),
    },
    notas: fila.notas,
    created_by: fila.created_by,
  };
}

/**
 * Filtra por el ámbito cualquier consulta de PostgREST sobre una tabla con
 * `tienda_id`:
 *   tienda  → tienda_id = id
 *   general → tienda_id IS NULL
 *   todas   → sin filtro
 */
export function filtrarPorAmbito<
  Q extends { eq(columna: string, valor: string): Q; is(columna: string, valor: null): Q },
>(consulta: Q, ambito: Ambito, columna = "tienda_id"): Q {
  if (ambito.tipo === "tienda") return consulta.eq(columna, ambito.tienda.id);
  if (ambito.tipo === "general") return consulta.is(columna, null);
  return consulta;
}
