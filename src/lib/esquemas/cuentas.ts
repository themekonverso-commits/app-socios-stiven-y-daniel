import { z } from "zod";

import { ESTADOS_CUENTA, PERIODICIDADES } from "@/lib/tipos-cuentas";

/**
 * Validación de cuentas y notas.
 *
 * La importa tanto el formulario como el Server Action: la del navegador es
 * comodidad, la del servidor es la que protege.
 */

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");

export const esquemaCuenta = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, "Ponle un nombre a la cuenta.")
      .max(120, "El nombre es demasiado largo."),
    tipo: z
      .string()
      .trim()
      .min(1, "Elige o escribe un tipo.")
      .max(40, "El tipo es demasiado largo."),
    email_asociado: z
      .union([z.email("Ese correo no tiene un formato válido."), z.literal("")])
      .nullable()
      .optional(),
    url: z
      .union([z.url("La dirección no es válida."), z.literal("")])
      .nullable()
      .optional(),
    titular_id: z.uuid().nullable().optional(),
    coste: z.number().finite().min(0).max(9_999_999).nullable().optional(),
    divisa: z.enum(["EUR", "USD"]),
    periodicidad: z.enum(PERIODICIDADES),
    fecha_renovacion: FECHA.nullable().optional(),
    aviso_dias: z.number().int().min(0).max(365),
    categoria_gasto_id: z.uuid().nullable().optional(),
    estado: z.enum(ESTADOS_CUENTA),
    notas: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    // Una suscripción recurrente sin importe no se puede sumar al coste
    // mensual, que es el número por el que existe esta pantalla.
    (datos) =>
      datos.periodicidad === "gratuito" ||
      (typeof datos.coste === "number" && datos.coste > 0),
    { message: "Indica el coste, o marca la periodicidad como gratuito.", path: ["coste"] },
  )
  .refine(
    (datos) =>
      datos.periodicidad === "puntual" ||
      datos.periodicidad === "gratuito" ||
      Boolean(datos.fecha_renovacion),
    {
      message: "Una cuenta recurrente necesita fecha de renovación.",
      path: ["fecha_renovacion"],
    },
  );

export type DatosCuenta = z.infer<typeof esquemaCuenta>;

export const esquemaNota = z.object({
  titulo: z.string().trim().max(200, "El título es demasiado largo."),
  contenido: z.string().max(50_000, "La nota es demasiado larga.").nullable().optional(),
  etiquetas: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "Demasiadas etiquetas.")
    .default([]),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "El color no es válido.")
    .nullable()
    .optional(),
  fijada: z.boolean().default(false),
  archivada: z.boolean().default(false),
});

export type DatosNota = z.infer<typeof esquemaNota>;

/** Filtros de /cuentas, sincronizados con la query string. */
export type FiltrosCuentas = {
  tipo: string;
  estado: string;
  titular: string;
  periodicidad: string;
  q: string;
  vista: "tarjetas" | "tabla";
};

function texto(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

export function leerFiltrosCuentas(
  params: Record<string, string | string[] | undefined>,
  vistaPorDefecto: "tarjetas" | "tabla" = "tarjetas",
): FiltrosCuentas {
  const vista = texto(params.vista);
  return {
    tipo: texto(params.tipo) || "todos",
    estado: texto(params.estado) || "todos",
    titular: texto(params.titular) || "todos",
    periodicidad: texto(params.periodicidad) || "todos",
    q: texto(params.q).slice(0, 120),
    vista: vista === "tabla" || vista === "tarjetas" ? vista : vistaPorDefecto,
  };
}

export function escribirFiltrosCuentas(filtros: Partial<FiltrosCuentas>): string {
  const params = new URLSearchParams();
  for (const clave of ["tipo", "estado", "titular", "periodicidad"] as const) {
    const valor = filtros[clave];
    if (valor && valor !== "todos") params.set(clave, valor);
  }
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.vista) params.set("vista", filtros.vista);
  return params.toString();
}

export function hayFiltrosCuentasActivos(filtros: FiltrosCuentas): boolean {
  return (
    filtros.tipo !== "todos" ||
    filtros.estado !== "todos" ||
    filtros.titular !== "todos" ||
    filtros.periodicidad !== "todos" ||
    filtros.q !== ""
  );
}
