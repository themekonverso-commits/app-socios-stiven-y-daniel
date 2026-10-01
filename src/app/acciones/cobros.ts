"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaCobro } from "@/lib/esquemas/cobro";
import { calcularNeto, conciliar, type Conciliacion } from "@/lib/cobros";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Server Actions de los cobros de la pasarela.
 *
 * Un cobro NO crea ningún ingreso: las ventas ya están en /diario. Sus gastos
 * (comisión y devoluciones) los genera la base de datos por disparador, en la
 * misma transacción que el cobro. Aquí solo se valida y se escribe la fila.
 */

const UUID = z.uuid();

function traducirError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("cobros_referencia_unica")) {
      return "Ese payout ya está registrado: hay otro cobro con la misma referencia.";
    }
    if (mensaje.includes("cobros_neto_cuadra")) {
      return "El neto no cuadra con el desglose (bruto − comisiones − devoluciones + ajustes).";
    }
    if (mensaje.includes("row-level security")) {
      return "No tienes permiso para hacer esto.";
    }
    return mensaje;
  }
  return "Ha ocurrido un error inesperado.";
}

function revalidar() {
  revalidatePath("/cobros");
  revalidatePath("/movimientos");
  revalidatePath("/kpis");
  revalidatePath("/liquidacion");
  revalidatePath("/ajustes");
  revalidatePath("/");
}

async function exigirSesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, usuario: user ?? null } as const;
}

/** Ventas de /diario en un rango: para conciliar mientras se rellena el formulario. */
export async function consultarVentasRegistradas(
  desde: string,
  hasta: string,
): Promise<Resultado<{ ventas: number }>> {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(desde) || !fecha.test(hasta) || desde > hasta) {
    return { ok: false, error: "Periodo no válido." };
  }

  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data, error } = await supabase.rpc("fn_ventas_registradas", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { ok: false, error: traducirError(error) };

  return { ok: true, datos: { ventas: Number(data ?? 0) } };
}

export async function crearCobro(
  entrada: unknown,
): Promise<Resultado<{ id: string; conciliacion: Conciliacion; plataforma: string }>> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaCobro.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const d = validacion.data;
  const neto = calcularNeto(d);

  const { data, error } = await supabase
    .from("cobros_pasarela")
    .insert({
      fecha_cobro: d.fecha_cobro,
      periodo_desde: d.periodo_desde,
      periodo_hasta: d.periodo_hasta,
      plataforma: d.plataforma,
      importe_bruto: d.importe_bruto,
      comisiones: d.comisiones,
      devoluciones: d.devoluciones,
      otros_ajustes: d.otros_ajustes,
      importe_neto: neto,
      referencia: d.referencia || null,
      notas: d.notas || null,
      created_by: usuario.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: traducirError(error) };

  // La conciliación se lee de la vista, la misma que pinta el listado.
  const { data: fila } = await supabase
    .from("vw_cobros_conciliacion")
    .select("importe_bruto, ventas_registradas")
    .eq("id", data.id)
    .maybeSingle();

  revalidar();
  return {
    ok: true,
    datos: {
      id: data.id,
      plataforma: d.plataforma,
      conciliacion: conciliar(
        Number(fila?.importe_bruto ?? d.importe_bruto),
        Number(fila?.ventas_registradas ?? 0),
      ),
    },
  };
}

/** Borra el cobro. La base de datos borra con él sus gastos generados. */
export async function eliminarCobro(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data, error } = await supabase
    .from("cobros_pasarela")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };

  // La RLS no lanza error: si el cobro es del otro socio, borra cero filas.
  if (!data || data.length === 0) {
    const { data: ajeno } = await supabase
      .from("vw_cobros_conciliacion")
      .select("autor_nombre")
      .eq("id", id)
      .maybeSingle();
    if (!ajeno) return { ok: false, error: "Ese cobro ya no existe." };
    return {
      ok: false,
      error: `Este cobro lo registró ${ajeno.autor_nombre ?? "el otro socio"}. Solo él puede eliminarlo.`,
    };
  }

  revalidar();
  return { ok: true };
}
