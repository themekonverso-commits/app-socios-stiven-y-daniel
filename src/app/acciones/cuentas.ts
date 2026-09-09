"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaCuenta } from "@/lib/esquemas/cuentas";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Server Actions del inventario de cuentas.
 *
 * Recordatorio: esto NO es un gestor de contraseñas. Ninguna de estas acciones
 * acepta ni guarda credenciales, y no debe añadirse esa posibilidad.
 */

const UUID = z.uuid();

function traducirError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("violates foreign key")) {
      return "La categoría o el socio seleccionados ya no existen.";
    }
    return mensaje;
  }
  return "Ha ocurrido un error inesperado.";
}

function revalidar() {
  revalidatePath("/cuentas");
  revalidatePath("/movimientos");
  revalidatePath("/kpis");
  revalidatePath("/");
}

/** Los campos vacíos se guardan como NULL, no como cadena vacía. */
function normalizar(datos: z.infer<typeof esquemaCuenta>) {
  const gratuito = datos.periodicidad === "gratuito";
  const sinRenovacion = gratuito || datos.periodicidad === "puntual";

  return {
    nombre: datos.nombre,
    tipo: datos.tipo,
    email_asociado: datos.email_asociado?.trim() || null,
    url: datos.url?.trim() || null,
    titular_id: datos.titular_id ?? null,
    coste: gratuito ? null : (datos.coste ?? null),
    divisa: datos.divisa,
    periodicidad: datos.periodicidad,
    fecha_renovacion: sinRenovacion ? null : (datos.fecha_renovacion ?? null),
    aviso_dias: datos.aviso_dias,
    categoria_gasto_id: datos.categoria_gasto_id ?? null,
    estado: datos.estado,
    notas: datos.notas?.trim() || null,
  };
}

/**
 * Mensaje único para cuando la RLS de autoría (migración 0012) bloquea.
 *
 * PostgREST no devuelve error cuando la política no ve la fila: el UPDATE o el
 * DELETE afectan a cero y la llamada parece ir bien. Por eso todas las
 * escrituras de aquí piden `.select()` y comprueban cuántas filas volvieron.
 */
const SOLO_EL_AUTOR =
  "Esto lo creó el otro socio. Solo quien lo registró puede modificarlo o eliminarlo.";

export async function crearCuenta(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaCuenta.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const { data, error } = await supabase
    .from("cuentas_activos")
    .insert({ ...normalizar(validacion.data), created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true, datos: { id: String(data.id) } };
}

export async function actualizarCuenta(
  id: string,
  entrada: unknown,
): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const validacion = esquemaCuenta.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cuentas_activos")
    .update(normalizar(validacion.data))
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };
  if (!data || data.length === 0) return { ok: false, error: SOLO_EL_AUTOR };

  revalidar();
  return { ok: true };
}

export async function eliminarCuenta(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cuentas_activos")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };
  if (!data || data.length === 0) return { ok: false, error: SOLO_EL_AUTOR };

  revalidar();
  return { ok: true };
}

export async function cambiarEstadoCuenta(
  id: string,
  estado: string,
): Promise<Resultado> {
  const valido = z.enum(["activa", "pausada", "cancelada"]).safeParse(estado);
  if (!UUID.safeParse(id).success || !valido.success) {
    return { ok: false, error: "Datos no válidos." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cuentas_activos")
    .update({ estado: valido.data })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };
  if (!data || data.length === 0) return { ok: false, error: SOLO_EL_AUTOR };

  revalidar();
  return { ok: true };
}

/**
 * Registrar el pago de una cuenta.
 *
 * Crea el gasto Y avanza la renovación en UNA sola llamada, que en Postgres es
 * una sola transacción. Si el movimiento falla, la cuenta no se toca: nunca
 * queda una renovación avanzada sin su gasto detrás.
 */
export async function registrarPagoCuenta(
  cuentaId: string,
  fecha?: string,
  importe?: number,
): Promise<
  Resultado<{
    fecha_renovacion: string | null;
    ultimo_pago: string;
    importe_eur: number;
    renovacion_avanzada: boolean;
  }>
> {
  if (!UUID.safeParse(cuentaId).success) {
    return { ok: false, error: "Identificador no válido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_registrar_pago_cuenta", {
    p_cuenta: cuentaId,
    p_fecha: fecha ?? new Date().toISOString().slice(0, 10),
    p_importe: importe ?? undefined,
  });

  if (error) return { ok: false, error: traducirError(error) };

  revalidar();
  return {
    ok: true,
    datos: data as unknown as {
      fecha_renovacion: string | null;
      ultimo_pago: string;
      importe_eur: number;
      renovacion_avanzada: boolean;
    },
  };
}

/** Aplazar la renovación sin registrar pago: útil cuando ya se pagó fuera. */
export async function aplazarRenovacion(
  id: string,
  dias: number,
): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { ok: false, error: "El aplazamiento debe estar entre 1 y 365 días." };
  }

  const supabase = await crearClienteServidor();
  const { data: cuenta } = await supabase
    .from("cuentas_activos")
    .select("fecha_renovacion")
    .eq("id", id)
    .maybeSingle();

  const base = cuenta?.fecha_renovacion
    ? new Date(cuenta.fecha_renovacion)
    : new Date();
  base.setDate(base.getDate() + dias);

  const { data, error } = await supabase
    .from("cuentas_activos")
    .update({ fecha_renovacion: base.toISOString().slice(0, 10) })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };
  if (!data || data.length === 0) return { ok: false, error: SOLO_EL_AUTOR };

  revalidar();
  return { ok: true };
}
