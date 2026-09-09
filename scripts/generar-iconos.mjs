/**
 * Genera favicon.ico y apple-icon.png a partir de src/app/icon.svg.
 *
 * El SVG es la única fuente: si se retoca el logo, se vuelve a lanzar
 *   node scripts/generar-iconos.mjs
 * y los rasterizados se rehacen solos.
 *
 * El .ico se monta a mano porque sharp no escribe ese contenedor. Lleva PNG
 * dentro (16, 32 y 48 px), que es lo que admiten Windows Vista en adelante y
 * todos los navegadores actuales.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(join(raiz, "src/app/icon.svg"));

const rasterizar = (tamano) =>
  sharp(svg, { density: 384 }).resize(tamano, tamano).png({ compressionLevel: 9 }).toBuffer();

// ── apple-icon.png: 180x180, el tamaño que pide iOS ────────────────────────
await writeFile(join(raiz, "src/app/apple-icon.png"), await rasterizar(180));

// ── favicon.ico ────────────────────────────────────────────────────────────
const tamanos = [16, 32, 48];
const imagenes = await Promise.all(tamanos.map(rasterizar));

const cabecera = Buffer.alloc(6);
cabecera.writeUInt16LE(0, 0); // reservado
cabecera.writeUInt16LE(1, 2); // tipo 1 = icono
cabecera.writeUInt16LE(tamanos.length, 4);

let desplazamiento = 6 + tamanos.length * 16;
const entradas = tamanos.map((tamano, indice) => {
  const entrada = Buffer.alloc(16);
  entrada.writeUInt8(tamano === 256 ? 0 : tamano, 0); // ancho
  entrada.writeUInt8(tamano === 256 ? 0 : tamano, 1); // alto
  entrada.writeUInt8(0, 2); // colores de la paleta (0 = sin paleta)
  entrada.writeUInt8(0, 3); // reservado
  entrada.writeUInt16LE(1, 4); // planos
  entrada.writeUInt16LE(32, 6); // bits por píxel
  entrada.writeUInt32LE(imagenes[indice].length, 8);
  entrada.writeUInt32LE(desplazamiento, 12);
  desplazamiento += imagenes[indice].length;
  return entrada;
});

await writeFile(
  join(raiz, "src/app/favicon.ico"),
  Buffer.concat([cabecera, ...entradas, ...imagenes]),
);

console.log("apple-icon.png (180px) y favicon.ico (16/32/48) regenerados desde icon.svg");
