"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { redondear2 } from "@/lib/dinero";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Ajustes de la sociedad: saldos iniciales del banco y de PayPal.
 * Validado en el servidor, como todo lo que escribe.
 *
 * Solo escribe esas dos claves. Los objetivos mensuales son de cada tienda
 * (`tiendas.objetivo_mes`, se editan en /tiendas) y el cupo de la tarjeta ya
 * no tiene categorías: aquí no se vuelve a escribir ni `objetivo_mes` ni
 * `categoria_ids`.
 */

const esquemaAjustes = z.object({
  saldo_importe: z
    .number({ error: "Escribe el saldo inicial." })
    .finite("El saldo no es un número válido.")
    .min(-99_999_999)
    .max(99_999_999),
  saldo_fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  paypal_importe: z
    .number({ error: "Escribe el saldo inicial de PayPal." })
    .finite("El saldo de PayPal no es un número válido.")
    .min(-99_999_999)
    .max(99_999_999),
  paypal_fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de PayPal no es válida."),
});

export async function guardarAjustes(entrada: unknown): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaAjustes.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const datos = validacion.data;

  // upsert y no update: si alguien borró la fila de semilla, se recrea sola.
  const { error } = await supabase.from("ajustes").upsert(
    [
      {
        clave: "saldo_inicial",
        valor: {
          importe: redondear2(datos.saldo_importe),
          fecha: datos.saldo_fecha,
        },
      },
      {
        clave: "saldo_inicial_paypal",
        valor: {
          importe: redondear2(datos.paypal_importe),
          fecha: datos.paypal_fecha,
        },
      },
    ],
    { onConflict: "clave" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
