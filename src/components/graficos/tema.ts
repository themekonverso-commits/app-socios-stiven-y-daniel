/**
 * Tema compartido de todos los gráficos.
 *
 * Los colores se leen de los tokens del sistema de diseño, no se escriben a
 * mano: si cambia `--accent`, cambian los gráficos.
 */

export const COLOR = {
  marca: "var(--accent)",
  marcaHover: "var(--accent-hover)",
  exito: "var(--success)",
  peligro: "var(--danger)",
  aviso: "var(--warning)",
  borde: "var(--border)",
  textoApagado: "var(--text-muted)",
  superficie: "var(--bg-surface)",
  superficie2: "var(--bg-surface-2)",
} as const;

/**
 * Gradación de naranjas para el anillo de gastos, del más saturado al más
 * apagado, y un gris para «Otros». Nada de arcoíris: la categoría aquí no es
 * una variable cualitativa independiente, es un ranking por importe.
 */
export const PALETA_CATEGORIAS = [
  "#F2551E",
  "#FF7A47",
  "#C7420F",
  "#FF9E75",
  "#8F2F09",
  "#FFC2A6",
] as const;

export const COLOR_OTROS = "#6E6E73";

export const EJE = {
  stroke: "var(--text-muted)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

export const REJILLA = {
  stroke: "var(--border)",
  strokeOpacity: 0.5,
  /** Solo horizontal: las verticales ensucian sin aportar. */
  vertical: false,
} as const;

export const ALTURA_MINIMA = 240;
