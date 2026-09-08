import "server-only";

/**
 * Saneado de texto para las fuentes estándar del PDF.
 *
 * Helvetica se escribe con la codificación WinAnsi (CP1252), que cubre de
 * sobra el español —tildes, eñe, comillas angulares, el símbolo del euro— así
 * que no hace falta incrustar ninguna tipografía. Lo que NO cubre son los
 * emojis y los alfabetos no latinos, y ahí pdf-lib lanza una excepción.
 *
 * Como el acta imprime texto libre (las notas del cierre) y el libro imprime
 * conceptos escritos a mano, cualquier carácter fuera del repertorio tumbaría
 * la descarga entera. Se sustituye por «?» y el documento sale igual.
 */

/** Los huecos de 0x80–0x9F que CP1252 sí usa. */
const EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function sanearWinAnsi(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    const punto = caracter.codePointAt(0) ?? 0;
    const enLatin1 =
      (punto >= 0x20 && punto <= 0x7e) || (punto >= 0xa0 && punto <= 0xff);
    salida += enLatin1 || EXTRAS.includes(caracter) ? caracter : "?";
  }
  return salida;
}
