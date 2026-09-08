import { format, type Locale } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formato español para toda la interfaz.
 *   Moneda  →  1.234,56 €
 *   Fechas  →  31/12/2026
 *   Números →  1.234,56
 *
 * Todas las cifras se pintan con la clase `cifra` (font-variant-numeric:
 * tabular-nums) para que las columnas queden alineadas.
 */

const LOCALE_ES: Locale = es;

/**
 * `useGrouping: "always"` no es opcional aquí.
 *
 * Por defecto, la convención española de CLDR NO pone separador de miles en
 * los números de cuatro dígitos: 7441,10 € en vez de 7.441,10 €. En una tabla
 * de importes eso rompe la lectura en columna, porque unas cifras llevan punto
 * y otras no. Se fuerza el agrupamiento siempre.
 */
const formateadorEuros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const formateadorNumero = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const formateadorEntero = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});

/**
 * Cero negativo → cero.
 *
 * Negar un 0 en JavaScript da -0, y el formateador lo imprime como «-0,00 €».
 * En una cascada donde los gastos se muestran en negativo, un periodo sin
 * gastos salía «-0,00 €», que parece un error de cálculo.
 */
function normalizarCero(valor: number): number {
  return Object.is(valor, -0) ? 0 : valor;
}

/** 1234.56 → "1.234,56 €" */
export function formatearEuros(valor: number): string {
  return formateadorEuros.format(normalizarCero(valor));
}

/** 1234.56 → "1.234,56" */
export function formatearNumero(valor: number): string {
  return formateadorNumero.format(normalizarCero(valor));
}

/** 1234 → "1.234" */
export function formatearEntero(valor: number): string {
  return formateadorEntero.format(valor);
}

/**
 * Variación porcentual con signo explícito: 12.4 → "+12,4 %", -3 → "-3,0 %".
 * El signo es intencionado: el color no puede ser el único indicador.
 */
export function formatearVariacion(valor: number): string {
  const signo = valor > 0 ? "+" : "";
  const numero = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(valor);
  return `${signo}${numero} %`;
}

/**
 * Porcentaje en formato español: 20.6 → "20,6 %".
 * Interpolar el número a pelo (`${valor} %`) imprimía "20.6 %" con punto, que
 * en una interfaz en español chirría y además no coincide con el resto de
 * cifras de la misma pantalla.
 */
export function formatearPorcentaje(valor: number, decimales = 1): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
    useGrouping: "always",
  }).format(valor);
}

/** Date | string ISO → "31/12/2026" */
export function formatearFecha(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  return format(valor, "dd/MM/yyyy", { locale: LOCALE_ES });
}

/** Date | string ISO → "31 de diciembre de 2026" */
export function formatearFechaLarga(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  return format(valor, "d 'de' MMMM 'de' yyyy", { locale: LOCALE_ES });
}

/**
 * Mayúscula solo en la primera letra.
 *
 * `text-transform: capitalize` de CSS pone mayúscula en CADA palabra, lo que en
 * español produce cosas como «Todos Los Tipos». Esto respeta la ortografía.
 */
export function mayusculaInicial(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
