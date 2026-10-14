"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaCobro, esquemaTraspaso } from "@/lib/esquemas/cobro";
import { calcularNeto, conciliar, type Conciliacion } from "@/lib/cobros";
import {
  PLATAFORMAS_COBRO,
  metodoDePlataforma,
  type PlataformaCobro,
} from "@/lib/metodos-cobro";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Server Actions de los cobros de la pasarela y de los traspasos PayPal → Banco.
 *
 * Un cobro NO crea ningún ingreso: las ventas ya están en /diario. Sus gastos
 * (comisión y devoluciones) los genera la base de datos por disparador, en la
 * misma transacción que el cobro. Aquí solo se valida y se escribe la fila.
 *
 * Desde la 0017 cada cobro es de Shopify Payments o de PayPal, y se concilia
 * solo con las ventas de su mismo método. Desde la 0018 además es de una
 * tienda, y solo concilia (y solo busca duplicados) dentro de ella.
 */

const UUID = z.uuid();

function traducirError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("cobros_referencia_unica")) {
      return "Ese payout ya está registrado: hay otro cobro de la tienda con la misma referencia.";
    }
    if (mensaje.includes("traspasos_neto_cuadra") || mensaje.includes("traspasos_importes_validos")) {
      return "El traspaso no cuadra: la comisión tiene que ser menor que el importe.";
    }
    if (mensaje.includes("cobros_plataforma_valida")) {
      return "La plataforma tiene que ser Shopify Payments o PayPal.";
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
  revalidatePath("/diario");
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

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La tienda tiene que existir y no estar archivada: los gastos que genera el
 * cobro (comisión y devoluciones) van a su tienda, y una archivada no admite
 * movimientos nuevos.
 */
async function comprobarTienda(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  tiendaId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tiendas")
    .select("estado")
    .eq("id", tiendaId)
    .maybeSingle();
  if (!data) return "Esa tienda no existe. Elige otra en el selector.";
  if (data.estado === "archivada") {
    return "La tienda está archivada: no admite cobros nuevos.";
  }
  return null;
}

function plataformaValida(valor: string): valor is PlataformaCobro {
  return (PLATAFORMAS_COBRO as readonly string[]).includes(valor);
}

export type Solape = {
  id: string;
  fecha_cobro: string;
  periodo_desde: string;
  periodo_hasta: string;
  importe_bruto: number;
  referencia: string | null;
  motivo: "periodo" | "referencia";
};

/**
 * Lo que el formulario enseña mientras se rellena: las ventas de /diario de
 * la MISMA tienda y el MISMO método en el periodo, y los cobros de la misma
 * tienda y plataforma que se solapan con él (o llevan la misma referencia).
 * Un cobro de PayPal y uno de Shopify del mismo periodo son normales y no
 * aparecen aquí; tampoco los de otra tienda.
 */
export async function consultarVentasRegistradas(
  tiendaId: string,
  desde: string,
  hasta: string,
  plataforma: string,
  referencia?: string | null,
): Promise<Resultado<{ ventas: number; solapados: Solape[] }>> {
  if (!UUID.safeParse(tiendaId).success) return { ok: false, error: "Elige una tienda." };
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta) || desde > hasta) {
    return { ok: false, error: "Periodo no válido." };
  }
  if (!plataformaValida(plataforma)) return { ok: false, error: "Plataforma no válida." };

  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const [ventas, solapes] = await Promise.all([
    supabase.rpc("fn_ventas_registradas", {
      p_tienda: tiendaId,
      p_desde: desde,
      p_hasta: hasta,
      p_metodo: metodoDePlataforma(plataforma),
    }),
    // Sin valores por defecto en SQL: la referencia vacía equivale a ninguna.
    supabase.rpc("fn_cobros_solapados", {
      p_tienda: tiendaId,
      p_plataforma: plataforma,
      p_desde: desde,
      p_hasta: hasta,
      p_referencia: referencia?.trim() ?? "",
    }),
  ]);

  if (ventas.error) return { ok: false, error: traducirError(ventas.error) };
  if (solapes.error) return { ok: false, error: traducirError(solapes.error) };

  return {
    ok: true,
    datos: {
      ventas: Number(ventas.data ?? 0),
      solapados: (solapes.data ?? []).map((s) => ({
        id: s.id,
        fecha_cobro: s.fecha_cobro,
        periodo_desde: s.periodo_desde,
        periodo_hasta: s.periodo_hasta,
        importe_bruto: Number(s.importe_bruto),
        referencia: s.referencia,
        motivo: s.motivo === "referencia" ? "referencia" : "periodo",
      })),
    },
  };
}

export async function crearCobro(
  entrada: unknown,
): Promise<
  Resultado<{
    id?: string;
    conciliacion?: Conciliacion;
    plataforma?: string;
    /** Hay cobros de la misma plataforma que se solapan: pedir confirmación. */
    solapados?: Solape[];
  }>
> {
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

  const tiendaMal = await comprobarTienda(supabase, d.tienda_id);
  if (tiendaMal) return { ok: false, error: tiendaMal, campo: "tienda_id" };

  // Posible duplicado: solo dentro de la misma plataforma. Se avisa y se
  // guarda únicamente si el usuario lo confirma (una semana partida en dos
  // payouts es rara, pero existe).
  if (!d.confirmar_solape) {
    const { data: solapes, error: errorSolapes } = await supabase.rpc("fn_cobros_solapados", {
      p_tienda: d.tienda_id,
      p_plataforma: d.plataforma,
      p_desde: d.periodo_desde,
      p_hasta: d.periodo_hasta,
      p_referencia: d.referencia?.trim() ?? "",
    });
    if (errorSolapes) return { ok: false, error: traducirError(errorSolapes) };

    const lista = (solapes ?? []).map((s) => ({
      id: s.id,
      fecha_cobro: s.fecha_cobro,
      periodo_desde: s.periodo_desde,
      periodo_hasta: s.periodo_hasta,
      importe_bruto: Number(s.importe_bruto),
      referencia: s.referencia,
      motivo: (s.motivo === "referencia" ? "referencia" : "periodo") as Solape["motivo"],
    }));

    // Misma referencia en la misma plataforma: lo impide el índice único, no
    // tiene sentido ofrecer «guardar igualmente».
    if (lista.some((s) => s.motivo === "referencia")) {
      return {
        ok: false,
        error: "Ese cobro ya está registrado: hay otro de la misma tienda y plataforma con la misma referencia.",
      };
    }
    if (lista.length > 0) return { ok: true, datos: { solapados: lista } };
  }

  const { data, error } = await supabase
    .from("cobros_pasarela")
    .insert({
      tienda_id: d.tienda_id,
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


/**
 * Traspaso PayPal → Banco. No es ingreso ni gasto: solo mueve saldo entre
 * las dos cuentas del negocio. Si PayPal cobra comisión, la base de datos
 * genera ese gasto por disparador.
 */
export async function crearTraspaso(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaTraspaso.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const d = validacion.data;
  const importe = Math.round(d.importe * 100) / 100;
  const comision = Math.round(d.comision * 100) / 100;

  const { data, error } = await supabase
    .from("traspasos_paypal")
    .insert({
      fecha: d.fecha,
      importe,
      comision,
      importe_neto: Math.round((importe - comision) * 100) / 100,
      referencia: d.referencia || null,
      notas: d.notas || null,
      created_by: usuario.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: traducirError(error) };

  revalidar();
  return { ok: true, datos: { id: data.id } };
}

/** Borra el traspaso y, con él, su gasto de comisión si lo tenía. */
export async function eliminarTraspaso(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data, error } = await supabase
    .from("traspasos_paypal")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: traducirError(error) };

  if (!data || data.length === 0) {
    const { data: ajeno } = await supabase
      .from("traspasos_paypal")
      .select("autor:created_by ( nombre )")
      .eq("id", id)
      .maybeSingle();
    if (!ajeno) return { ok: false, error: "Ese traspaso ya no existe." };
    const nombre = (ajeno.autor as { nombre?: string } | null)?.nombre;
    return {
      ok: false,
      error: `Este traspaso lo registró ${nombre ?? "el otro socio"}. Solo él puede eliminarlo.`,
    };
  }

  revalidar();
  return { ok: true };
}
