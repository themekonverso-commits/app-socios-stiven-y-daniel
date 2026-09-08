/**
 * Tipos del inventario de cuentas y del bloc de notas.
 *
 * `cuentas_activos` es un INVENTARIO, no un gestor de contraseñas: no hay
 * ningún campo de credenciales y no debe añadirse.
 */
import type { Database } from "@/types/database";

type Tablas = Database["public"]["Tables"];
type Vistas = Database["public"]["Views"];

export const TIPOS_CUENTA = [
  "plataforma",
  "dominio",
  "herramienta",
  "red social",
  "banco",
  "proveedor",
  "otro",
] as const;

export const PERIODICIDADES = ["mensual", "anual", "puntual", "gratuito"] as const;
export const ESTADOS_CUENTA = ["activa", "pausada", "cancelada"] as const;

export type Periodicidad = (typeof PERIODICIDADES)[number];
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number];

export type Cuenta = Tablas["cuentas_activos"]["Row"];

/** Cuenta con el coste ya normalizado a mensual y en euros por la vista. */
export type CuentaConCoste = Vistas["vw_cuentas_coste"]["Row"] & {
  id: string;
  nombre: string;
  coste_mensual_eur: number;
  coste_eur: number;
  dias_para_renovar: number | null;
  vencida: boolean;
  renueva_pronto: boolean;
  titular_nombre: string | null;
  titular_color: string | null;
  categoria_nombre: string | null;
  hay_tasa: boolean;
};

export type ResumenCuentas = {
  costeMensual: number;
  costeAnual: number;
  activas: number;
  pausadas: number;
  canceladas: number;
  proxima: CuentaConCoste | null;
  porTitular: {
    socio_id: string;
    nombre: string;
    color: string | null;
    cuentas: number;
    costeMensual: number;
  }[];
  vencidas: CuentaConCoste[];
  proximas: CuentaConCoste[];
};

export type Nota = Tablas["notas"]["Row"] & {
  etiquetas: string[];
};

export type NotaConAutor = Nota & {
  autor_nombre: string;
  autor_color: string | null;
};

/**
 * Paleta del acento de una nota: el naranja de marca más unos tonos apagados
 * que no compiten con él.
 */
export const COLORES_NOTA = [
  { valor: null, nombre: "Sin color" },
  { valor: "#F2551E", nombre: "Naranja" },
  { valor: "#3B82F6", nombre: "Azul" },
  { valor: "#34C759", nombre: "Verde" },
  { valor: "#FFD60A", nombre: "Amarillo" },
  { valor: "#A78BFA", nombre: "Lila" },
  { valor: "#6E6E73", nombre: "Gris" },
] as const;
