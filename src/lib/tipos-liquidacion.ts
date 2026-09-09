/**
 * Tipos de la liquidación.
 *
 * Las funciones SQL devuelven jsonb, así que aquí se declara la forma que
 * tienen esos objetos. Es la frontera entre el cálculo (Postgres) y la
 * interfaz: la aplicación NO recalcula nada, solo pinta lo que llega.
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
   * La parte que consume el cupo de la tarjeta (R6). Si el ajuste
   * `limite_aportacion` no tiene ámbito, coincide con `anticipado`.
   */
  anticipado_cupo: number;
  /** El resto: reembolsable igual, pero no gasta tarjeta. */
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

export type LimiteAportacion = {
  socio_id: string | null;
  importe: number;
  /**
   * Ámbito del cupo. Los 3.000 € son el tope de una tarjeta destinada solo a
   * publicidad: un anticipo de otra categoría se reembolsa igual, pero no
   * consume cupo. A null, el cupo cuenta todos los anticipos.
   */
  categoria_id: string | null;
  categoria_nombre: string | null;
};
