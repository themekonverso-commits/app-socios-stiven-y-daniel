/**
 * Tipos de la liquidación.
 *
 * Las funciones SQL devuelven jsonb, así que aquí se declara la forma que
 * tienen esos objetos. Es la frontera entre el cálculo (Postgres) y la
 * interfaz: la aplicación NO recalcula nada, solo pinta lo que llega.
 *
 * La liquidación es de la SOCIEDAD (0018): suma todas las tiendas y General, y
 * no cambia con el selector de tienda. La tienda de cada anticipo se enseña
 * para saber de dónde viene, no para filtrar.
 */

export type AnticipoSocio = {
  anticipado: number;
  reembolsado: number;
  pendiente: number;
  nombre: string;
};

export type EstadoLiquidacion = {
  fecha_corte: string;
  periodo_abierto_desde: string | null;
  ingresos_acumulados: number;
  gastos_acumulados: number;
  resultado_acumulado: number;
  arrastre_previo: number;
  perdidas_acumuladas: number;
  anticipos: Record<string, AnticipoSocio>;
  total_pendiente_reembolso: number;
  caja_disponible: number;
  base_distribuible: number;
  en_fase_inicial: boolean;
  puede_repartir: boolean;
  motivo_bloqueo: string | null;
  motivos_bloqueo: string[];
};

export type LiquidacionFinal = {
  por_socio: Record<
    string,
    { anticipado: number; reembolsado: number; neto: number }
  >;
  total_neto: number;
  mitad_correspondiente: number;
  deudor_id: string | null;
  acreedor_id: string | null;
  importe_a_compensar: number;
};

export type ResumenSocio = {
  socio_id: string;
  nombre: string;
  color: string | null;
  /** Todo lo que ha puesto de su bolsillo. Es lo que manda en los reembolsos. */
  anticipado: number;
  /**
   * La parte pagada con la tarjeta de crédito (medio_pago = tarjeta_daniel):
   * es la que consume el cupo (R6), de todas las tiendas y de General.
   */
  anticipado_cupo: number;
  /** Lo pagado de bolsillo: reembolsable igual, pero no gasta tarjeta. */
  anticipado_otros: number;
  reembolsado: number;
  pendiente: number;
  num_anticipos: number;
};

export type AnticipoPendiente = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  socio_id: string;
  socio: string;
  socio_color: string | null;
  total_eur: number;
  reembolsado_eur: number;
  pendiente_eur: number;
  /** null = General / Sociedad. */
  tienda_id: string | null;
  /** Nombre de la tienda, o «General / Sociedad». */
  tienda: string;
  /** Color de la tienda; null en General. */
  tienda_color: string | null;
  /** tarjeta_daniel | bolsillo. */
  medio_pago: string | null;
};

/**
 * Cuenta del negocio de la que sale un reembolso (0017). Es la columna
 * `reembolsos.cuenta_pago`, que sigue existiendo: no confundir con la
 * `movimientos.cuenta_pago` que retiró la 0019.
 */
export const CUENTAS_REEMBOLSO = ["banco", "paypal"] as const;
export type CuentaReembolso = (typeof CUENTAS_REEMBOLSO)[number];
export const ETIQUETA_CUENTA_REEMBOLSO: Record<CuentaReembolso, string> = {
  banco: "Banco",
  paypal: "PayPal",
};

export type MetodoReembolso = "transferencia" | "efectivo" | "compensación";

export const METODOS_REEMBOLSO: MetodoReembolso[] = [
  "transferencia",
  "efectivo",
  "compensación",
];

export type ReembolsoHistorial = {
  id: string;
  fecha: string;
  socio_id: string;
  socio: string;
  socio_color: string | null;
  importe_eur: number;
  metodo: string | null;
  notas: string | null;
  num_anticipos: number;
  registrado_por: string;
  /** Tiendas de los anticipos que cubre (null = General), sin repetir. */
  tiendas: (string | null)[];
};

export type EstadoCierre = "borrador" | "aprobado" | "anulado";

export type Cierre = {
  id: string;
  etiqueta: string;
  periodo_inicio: string;
  periodo_fin: string;
  ingresos_eur: number;
  gastos_eur: number;
  resultado_eur: number;
  perdidas_previas_eur: number;
  anticipos_pendientes_eur: number;
  base_distribuible_eur: number;
  pct_reinversion: number;
  pct_reparto: number;
  importe_reinversion: number;
  importe_reparto_total: number;
  reparto_por_socio: Record<string, number>;
  estado: EstadoCierre;
  aprobaciones: Record<string, string>;
  notas: string | null;
  created_by: string;
  created_at: string | null;
};

/** Un gasto pagado con la tarjeta (R6), para la lista de los últimos. */
export type MovimientoCupo = {
  id: string;
  fecha: string;
  concepto: string;
  total_eur: number;
  categoria: string;
  /** null = General / Sociedad. */
  tienda_id: string | null;
};

export type LimiteAportacion = {
  socio_id: string | null;
  importe: number;
  /**
   * Qué cuenta el cupo, en una frase para los textos. Desde la 0018 el cupo
   * mide los gastos pagados con la tarjeta (medio_pago = tarjeta_daniel), de
   * todas las tiendas y de General; ya no filtra por categoría.
   */
  ambito: string | null;
};
