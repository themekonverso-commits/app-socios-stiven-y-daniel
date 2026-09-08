/**
 * Aritmética de dinero.
 *
 * En JavaScript 0.1 + 0.2 no es 0.3. Cada paso intermedio se redondea a dos
 * decimales para que la base, el IVA y el total cuadren siempre entre sí y con
 * lo que acabará guardando Postgres en sus columnas numeric(12,2).
 */

/** Redondeo a 2 decimales, estable frente al error de coma flotante. */
export function redondear2(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Redondeo a 6 decimales, para las tasas de cambio. */
export function redondear6(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/** Base + IVA → importe de IVA y total. */
export function calcularDesdeBase(base: number, tipoIva: number) {
  const baseRedondeada = redondear2(base);
  const ivaImporte = redondear2((baseRedondeada * tipoIva) / 100);
  return {
    base: baseRedondeada,
    ivaImporte,
    total: redondear2(baseRedondeada + ivaImporte),
  };
}

/**
 * Total + IVA → base e importe de IVA (cálculo inverso).
 *
 * El IVA se saca por diferencia y no con su propia fórmula, para que
 * base + iva == total exactamente, sin céntimos descuadrados por el redondeo.
 */
export function calcularDesdeTotal(total: number, tipoIva: number) {
  const totalRedondeado = redondear2(total);
  const base = redondear2(totalRedondeado / (1 + tipoIva / 100));
  return {
    base,
    ivaImporte: redondear2(totalRedondeado - base),
    total: totalRedondeado,
  };
}

/** Conversión a la divisa de reporte. */
export function convertirAEuros(importe: number, tasa: number): number {
  return redondear2(importe * tasa);
}

/**
 * Lee un número escrito por una persona en español: "1.234,56" → 1234.56.
 * Acepta también el formato inglés "1234.56" cuando no hay ambigüedad.
 */
export function parsearNumeroEspanol(entrada: string): number | null {
  const limpio = entrada.trim().replace(/\s|€|\$/g, "");
  if (!limpio) return null;

  let normalizado = limpio;
  const tieneComa = limpio.includes(",");
  const tienePunto = limpio.includes(".");

  if (tieneComa && tienePunto) {
    // "1.234,56" → el punto es separador de miles.
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (tieneComa) {
    normalizado = limpio.replace(",", ".");
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}
