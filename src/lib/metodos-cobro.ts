/**
 * Métodos de cobro y cuentas del negocio (migración 0017).
 *
 * Shopify Payments y PayPal cobran distinto:
 *   · Shopify Payments paga al BANCO una vez por semana, los miércoles, con
 *     las ventas de la semana anterior.
 *   · PayPal deja el dinero en la CUENTA DE PAYPAL el mismo día de la venta y
 *     pasa al banco solo cuando lo traspasamos.
 *
 * Los valores son los mismos que validan los CHECK de la base de datos.
 */

export const METODOS_COBRO = ["shopify_payments", "paypal"] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];

export const ETIQUETA_METODO: Record<MetodoCobro, string> = {
  shopify_payments: "Shopify Payments",
  paypal: "PayPal",
};

/** Lo que se guarda en `cobros_pasarela.plataforma`. */
export const PLATAFORMAS_COBRO = ["Shopify Payments", "PayPal"] as const;
export type PlataformaCobro = (typeof PLATAFORMAS_COBRO)[number];

export function metodoDePlataforma(plataforma: string): MetodoCobro {
  return plataforma === "PayPal" ? "paypal" : "shopify_payments";
}

export function plataformaDeMetodo(metodo: MetodoCobro): PlataformaCobro {
  return metodo === "paypal" ? "PayPal" : "Shopify Payments";
}

/**
 * Cuentas del negocio de las que sale un reembolso a un socio. Los gastos ya
 * no las usan: desde la 0018 llevan `medio_pago` (ver lib/medios-pago.ts).
 */
export const CUENTAS_PAGO = ["banco", "paypal"] as const;
export type CuentaPago = (typeof CUENTAS_PAGO)[number];

export const ETIQUETA_CUENTA: Record<CuentaPago, string> = {
  banco: "Banco",
  paypal: "PayPal",
};
