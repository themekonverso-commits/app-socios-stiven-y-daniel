import { z } from "zod";

import { MEDIOS_PAGO } from "@/lib/medios-pago";

/**
 * Esquemas de validación de movimientos.
 *
 * Este archivo lo importan TANTO el formulario del navegador COMO los Server
 * Actions. La validación de cliente es comodidad; la del servidor es la que
 * protege de verdad, porque cualquiera puede llamar a la acción sin pasar por
 * el formulario.
 */

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const TIPOS_IVA = [21, 10, 4, 0] as const;
export const PLATAFORMAS = ["Meta", "TikTok", "Google", "Otra"] as const;

const importePositivo = z
  .number({ error: "Escribe un importe." })
  .finite("El importe no es un número válido.")
  .gt(0, "El importe tiene que ser mayor que cero.")
  .max(99_999_999, "Ese importe es demasiado grande.");

export const esquemaMovimiento = z
  .object({
    tipo: z.enum(["ingreso", "gasto"], { error: "Elige ingreso o gasto." }),

    fecha: z
      .string()
      .regex(FECHA_ISO, "La fecha no es válida."),

    concepto: z
      .string()
      .trim()
      .min(1, "Escribe un concepto.")
      .max(200, "El concepto no puede pasar de 200 caracteres."),

    /** Id de una categoría existente. Vacío si se va a crear una nueva. */
    categoria_id: z.uuid("Elige una categoría.").nullable(),

    /** Nombre de una categoría a crear al vuelo desde el propio formulario. */
    categoria_nueva: z
      .string()
      .trim()
      .max(60, "El nombre de la categoría es demasiado largo.")
      .optional(),

    divisa: z.enum(["EUR", "USD"]),

    tasa_cambio: z
      .number()
      .positive("La tasa de cambio tiene que ser mayor que cero.")
      .max(1000, "Esa tasa de cambio no parece correcta."),

    base_imponible: importePositivo,
    iva_tipo: z.union([
      z.literal(21),
      z.literal(10),
      z.literal(4),
      z.literal(0),
    ]),
    iva_importe: z.number().min(0),
    total: importePositivo,

    /**
     * Tienda del movimiento. null = General / Sociedad (gastos compartidos).
     * Un ingreso siempre es de una tienda: lo exige un CHECK de la 0018.
     */
    tienda_id: z.uuid("La tienda elegida no es válida.").nullable(),

    /**
     * Solo en gastos: con qué se pagó (0018). Sustituye a la antigua
     * «cuenta de pago». Con tarjeta, el socio lo fija la base de datos; con
     * bolsillo hay que elegirlo; con banco o PayPal no hay socio.
     */
    medio_pago: z.enum(MEDIOS_PAGO, { error: "Elige el medio de pago." }).nullable(),

    /** Quién adelantó el dinero. Solo cuenta con «bolsillo». */
    anticipado_por: z.uuid().nullable(),

    num_pedidos: z.number().int().min(0).nullable().optional(),
    plataforma: z.enum(PLATAFORMAS).nullable().optional(),
    impresiones: z.number().int().min(0).nullable().optional(),
    clicks: z.number().int().min(0).nullable().optional(),

    notas: z
      .string()
      .trim()
      .max(1000, "Las notas no pueden pasar de 1000 caracteres.")
      .nullable()
      .optional(),
  })
  .refine(
    (datos) => Boolean(datos.categoria_id) || Boolean(datos.categoria_nueva),
    { message: "Elige una categoría o crea una nueva.", path: ["categoria_id"] },
  )
  .refine(
    (datos) => datos.tipo === "gasto" || Boolean(datos.tienda_id),
    {
      message: "Un ingreso tiene que ser de una tienda: elige cuál.",
      path: ["tienda_id"],
    },
  )
  .refine(
    // En gastos hay que saber con qué se pagó: de eso viven la liquidación,
    // el cupo de la tarjeta y los saldos del banco y de PayPal.
    (datos) => datos.tipo === "ingreso" || datos.medio_pago !== null,
    { message: "Elige el medio de pago.", path: ["medio_pago"] },
  )
  .refine(
    (datos) =>
      datos.tipo === "ingreso" ||
      datos.medio_pago !== "bolsillo" ||
      Boolean(datos.anticipado_por),
    {
      message: "Elige qué socio lo pagó de su bolsillo.",
      path: ["anticipado_por"],
    },
  )
  .refine(
    (datos) => datos.divisa === "USD" || datos.tasa_cambio === 1,
    { message: "Un movimiento en euros no lleva tasa de cambio.", path: ["tasa_cambio"] },
  );

export type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

/**
 * Registro rápido de las ventas del día, desglosadas por método de cobro.
 * Cada método con importe genera su propio ingreso; el total del día es la
 * suma (lo calcula la base de datos al agregar, no se guarda aparte).
 */
const importeCero = z
  .number()
  .finite("El importe no es un número válido.")
  .min(0, "No puede ser negativo.")
  .max(99_999_999, "Ese importe es demasiado grande.");

const pedidos = z
  .number()
  .int("Los pedidos son un número entero.")
  .min(0, "No puede ser negativo.")
  .max(100_000, "Ese número de pedidos no parece correcto.");

export const esquemaVentaDiaria = z
  .object({
    /** Las ventas siempre son de una tienda concreta. */
    tienda_id: z.uuid("Elige una tienda para registrar las ventas del día."),
    fecha: z.string().regex(FECHA_ISO, "La fecha no es válida."),
    shopify_importe: importeCero,
    shopify_pedidos: pedidos,
    paypal_importe: importeCero,
    paypal_pedidos: pedidos,
    divisa: z.enum(["EUR", "USD"]),
    tasa_cambio: z.number().positive().max(1000),
    /** El usuario ya confirmó que quiere sobrescribir el registro de ese día. */
    sobrescribir: z.boolean().optional(),
  })
  .refine((d) => d.shopify_importe > 0 || d.paypal_importe > 0, {
    message: "Escribe las ventas del día de al menos un método de cobro.",
    path: ["shopify_importe"],
  })
  .refine((d) => d.shopify_importe > 0 || d.shopify_pedidos === 0, {
    message: "Hay pedidos de Shopify Payments sin importe.",
    path: ["shopify_importe"],
  })
  .refine((d) => d.paypal_importe > 0 || d.paypal_pedidos === 0, {
    message: "Hay pedidos de PayPal sin importe.",
    path: ["paypal_importe"],
  });

export type DatosVentaDiaria = z.infer<typeof esquemaVentaDiaria>;

/** Alta y edición de categorías. */
export const esquemaCategoria = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribe un nombre.")
    .max(60, "El nombre es demasiado largo."),
  tipo: z.enum(["ingreso", "gasto"]),
});

export type DatosCategoria = z.infer<typeof esquemaCategoria>;
