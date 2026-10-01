import { z } from "zod";

/**
 * Validación de un cobro de la pasarela (payout de Shopify).
 *
 * La importa el formulario y el Server Action. El neto NO viaja: lo calcula el
 * servidor con `calcularNeto`, y la base de datos vuelve a comprobarlo con un
 * CHECK. Tres cerraduras para la misma cifra, porque es la que llega al banco.
 */

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");
const IMPORTE = z.number().finite().max(9_999_999);

export const esquemaCobro = z
  .object({
    fecha_cobro: FECHA,
    periodo_desde: FECHA,
    periodo_hasta: FECHA,
    plataforma: z
      .string()
      .trim()
      .min(1, "Indica la plataforma.")
      .max(60, "El nombre de la plataforma es demasiado largo."),
    importe_bruto: IMPORTE.min(0, "El bruto no puede ser negativo."),
    comisiones: IMPORTE.min(0, "Las comisiones no pueden ser negativas."),
    devoluciones: IMPORTE.min(0, "Las devoluciones no pueden ser negativas."),
    otros_ajustes: IMPORTE.min(-9_999_999),
    referencia: z.string().trim().max(80).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => d.periodo_desde <= d.periodo_hasta, {
    message: "El periodo termina antes de empezar.",
    path: ["periodo_hasta"],
  })
  .refine((d) => d.importe_bruto > 0, {
    message: "Escribe el importe bruto de las ventas del payout.",
    path: ["importe_bruto"],
  });

export type DatosCobro = z.infer<typeof esquemaCobro>;
