/**
 * Medio de pago de un gasto (migración 0018). Sustituye a la antigua
 * «cuenta de pago». Las reglas las impone la base de datos (trigger
 * normalizar_medio_pago); aquí solo viven las etiquetas y lo que la interfaz
 * necesita saber para pintar el formulario.
 *
 *   tarjeta_daniel → tarjeta de crédito del socio de la tarjeta. Es un
 *                    anticipo suyo, siempre: el negocio se lo debe.
 *   bolsillo       → efectivo o cuenta personal de un socio. Hay que elegir quién.
 *   banco          → cuenta bancaria del negocio. Resta del saldo del banco.
 *   paypal         → cuenta PayPal del negocio. Resta del saldo de PayPal.
 */

export const MEDIOS_PAGO = ["tarjeta_daniel", "bolsillo", "banco", "paypal"] as const;

export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  tarjeta_daniel: "Tarjeta de Daniel",
  bolsillo: "Bolsillo de un socio",
  banco: "Banco",
  paypal: "PayPal",
};

/** Etiqueta corta para tablas y chips. */
export const ETIQUETA_MEDIO_CORTA: Record<MedioPago, string> = {
  tarjeta_daniel: "Tarjeta",
  bolsillo: "Bolsillo",
  banco: "Banco",
  paypal: "PayPal",
};

export const DESCRIPCION_MEDIO: Record<MedioPago, string> = {
  tarjeta_daniel: "Consume el cupo de la tarjeta. Queda como anticipo de Daniel.",
  bolsillo: "Lo adelantó un socio de su dinero. Se le debe.",
  banco: "Sale de la cuenta del negocio. No genera anticipo.",
  paypal: "Sale de la cuenta PayPal del negocio. No genera anticipo.",
};

export function esMedioPago(valor: unknown): valor is MedioPago {
  return typeof valor === "string" && (MEDIOS_PAGO as readonly string[]).includes(valor);
}

/** ¿Este medio es un anticipo de un socio? */
export function medioEsAnticipo(medio: MedioPago): boolean {
  return medio === "tarjeta_daniel" || medio === "bolsillo";
}

/** ¿Hay que elegir socio en el formulario? Solo con «bolsillo». */
export function medioPideSocio(medio: MedioPago): boolean {
  return medio === "bolsillo";
}
