"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { redondear2 } from "@/lib/dinero";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Ajustes del negocio: saldo inicial y objetivos mensuales.
 * Validado en el servidor, como todo lo que escribe.
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
  objetivo_facturacion: z
    .number()
    .finite()
    .min(0, "El objetivo no puede ser negativo.")
    .max(99_999_999),
  objetivo_beneficio: z
    .number()
    .finite()
    .min(-99_999_999)
    .max(99_999_999),
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
        clave: "objetivo_mes",
        valor: {
          facturacion: redondear2(datos.objetivo_facturacion),
          beneficio: redondear2(datos.objetivo_beneficio),
        },
      },
    ],
    { onConflict: "clave" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
