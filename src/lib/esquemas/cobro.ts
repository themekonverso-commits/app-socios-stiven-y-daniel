import { z } from "zod";

import { PLATAFORMAS_COBRO } from "@/lib/metodos-cobro";

/**
 * Validación de un cobro de la pasarela: payout de Shopify Payments o cobro
 * de PayPal.
 *
 * La importa el formulario y el Server Action. El neto NO viaja: lo calcula el
 * servidor con `calcularNeto`, y la base de datos vuelve a comprobarlo con un
 * CHECK. Tres cerraduras para la misma cifra, porque es la que llega al banco.
 */

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");
const IMPORTE = z.number().finite().max(9_999_999);

export const esquemaCobro = z
  .object({
    /** Tienda del cobro (0018). Obligatoria: un cobro siempre es de una tienda. */
    tienda_id: z.uuid({ error: "Elige la tienda del cobro." }),
    fecha_cobro: FECHA,
    periodo_desde: FECHA,
    periodo_hasta: FECHA,
    plataforma: z.enum(PLATAFORMAS_COBRO, { error: "Elige Shopify Payments o PayPal." }),
    importe_bruto: IMPORTE.min(0, "El bruto no puede ser negativo."),
    comisiones: IMPORTE.min(0, "Las comisiones no pueden ser negativas."),
    devoluciones: IMPORTE.min(0, "Las devoluciones no pueden ser negativas."),
    otros_ajustes: IMPORTE.min(-9_999_999),
    referencia: z.string().trim().max(80).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
    /** Ya se avisó de que se solapa con otro cobro de la misma plataforma. */
    confirmar_solape: z.boolean().optional(),
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

/**
 * Traspaso de PayPal al banco. No es ingreso ni gasto: solo mueve saldo. Si
 * PayPal cobra comisión, esa parte sí es gasto (lo genera la base de datos, en
 * General). No lleva tienda: PayPal y el banco son de la sociedad.
 */
export const esquemaTraspaso = z
  .object({
    fecha: FECHA,
    importe: IMPORTE.gt(0, "Escribe el importe que sale de PayPal."),
    comision: IMPORTE.min(0, "La comisión no puede ser negativa."),
    referencia: z.string().trim().max(80).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => d.comision < d.importe, {
    message: "La comisión no puede ser igual o mayor que el traspaso.",
    path: ["comision"],
  });

export type DatosTraspaso = z.infer<typeof esquemaTraspaso>;
