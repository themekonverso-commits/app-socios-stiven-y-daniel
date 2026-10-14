"use server";

import { revalidatePath } from "next/cache";

import { crearClienteServidor } from "@/lib/supabase/server";
import {
  esquemaMovimiento,
  esquemaVentaDiaria,
  type DatosMovimiento,
  type DatosVentaDiaria,
} from "@/lib/esquemas/movimiento";
import { convertirAEuros, redondear2, redondear6 } from "@/lib/dinero";
import type { FilaInsertMovimiento } from "@/lib/tipos-db";

/**
 * Server Actions de movimientos.
 *
 * Toda escritura pasa por aquí; el navegador nunca habla directamente con
 * Supabase. Y todo entra otra vez por zod: la validación del formulario es
 * comodidad para quien escribe, no una garantía, porque estas funciones se
 * pueden invocar sin pasar por el formulario.
 */

/**
 * ¿Es mío este movimiento?
 *
 * Desde la migración 0012 solo el autor puede editar o borrar. La RLS no
 * lanza error cuando bloquea: simplemente no ve la fila, el UPDATE afecta a
 * cero y PostgREST devuelve éxito. Sin esta comprobación previa, quien
 * intentase editar lo ajeno vería «Guardado» y no habría cambiado nada.
 *
 * Devuelve null si todo está en orden, o el mensaje que hay que enseñar.
 */
async function comprobarAutoria(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  id: string,
  usuarioId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("movimientos")
    .select("created_by, autor:created_by ( nombre )")
    .eq("id", id)
    .maybeSingle();

  if (!data) return "Ese movimiento ya no existe.";
  if (data.created_by === usuarioId) return null;

  const autor = (data.autor as { nombre?: string } | null)?.nombre;
  return autor
    ? `Este movimiento lo registró ${autor}. Solo él puede modificarlo o eliminarlo.`
    : "Este movimiento lo registró el otro socio. Solo él puede modificarlo o eliminarlo.";
}

export type Resultado<T = undefined> =
  | { ok: true; datos?: T }
  | { ok: false; error: string; campo?: string };

/**
 * Traduce un error de Postgres a una frase y, si se sabe, al campo del
 * formulario que lo causó. Las reglas de tienda y medio de pago las impone el
 * trigger `normalizar_medio_pago` (0018); sus mensajes ya están en español,
 * pero aquí se dicen en términos del formulario.
 */
function errorDeBase(error: unknown): { error: string; campo?: string } {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("La tienda está archivada")) {
      return {
        error: "Esa tienda está archivada y ya no admite movimientos nuevos. Elige otra.",
        campo: "tienda_id",
      };
    }
    if (mensaje.includes("movimientos_ingreso_con_tienda")) {
      return {
        error: "Un ingreso tiene que ser de una tienda: no puede ir a General.",
        campo: "tienda_id",
      };
    }
    if (mensaje.includes("movimientos_tienda_id_fkey")) {
      return { error: "La tienda elegida ya no existe.", campo: "tienda_id" };
    }
    if (mensaje.includes("pagado de bolsillo necesita")) {
      return { error: "Elige qué socio lo pagó de su bolsillo.", campo: "anticipado_por" };
    }
    if (mensaje.includes("ya tiene reembolsos aplicados")) {
      return {
        error:
          "Este gasto ya tiene reembolsos aplicados: no puede cambiar de socio. " +
          "Anula antes el reembolso en Liquidación, o deja el medio de pago como estaba.",
        campo: "medio_pago",
      };
    }
    if (mensaje.includes("ningún socio asignado a la tarjeta")) {
      return {
        error: "No hay ningún socio asignado a la tarjeta. Asígnalo en Ajustes (cupo de la tarjeta).",
        campo: "medio_pago",
      };
    }
    if (mensaje.includes("movimientos_medio_pago")) {
      return { error: "El medio de pago no es válido para este movimiento.", campo: "medio_pago" };
    }
    if (mensaje.includes("duplicate key")) {
      return { error: "Ya existe un registro igual." };
    }
    if (mensaje.includes("violates foreign key")) {
      return { error: "La categoría o el socio seleccionados ya no existen." };
    }
    if (mensaje.includes("row-level security")) {
      return { error: "No tienes permiso para hacer esto." };
    }
    return { error: mensaje };
  }
  return { error: "Ha ocurrido un error inesperado." };
}

function mensajeDeError(error: unknown): string {
  return errorDeBase(error).error;
}

/** Sesión activa, o error. Ninguna acción escribe sin pasar por aquí. */
async function exigirSesion() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, usuario: null } as const;
  return { supabase, usuario: user } as const;
}

type ClienteSupabase = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Devuelve el id de la categoría, creándola si el usuario escribió un nombre
 * nuevo en el combobox. Si ya existe una con ese nombre y tipo, se reutiliza en
 * vez de fallar por la restricción unique.
 */
async function resolverCategoria(
  supabase: ClienteSupabase,
  datos: DatosMovimiento,
): Promise<Resultado<string>> {
  if (datos.categoria_id) return { ok: true, datos: datos.categoria_id };

  const nombre = datos.categoria_nueva?.trim();
  if (!nombre) {
    return { ok: false, error: "Elige una categoría.", campo: "categoria_id" };
  }

  const { data: existente } = await supabase
    .from("categorias")
    .select("id")
    .eq("tipo", datos.tipo)
    .ilike("nombre", nombre)
    .maybeSingle();

  if (existente) {
    return { ok: true, datos: (existente as { id: string }).id };
  }

  const { data: creada, error } = await supabase
    .from("categorias")
    .insert({ nombre, tipo: datos.tipo, es_sistema: false, orden: 500 })
    .select("id")
    .single();

  if (error || !creada) {
    return { ok: false, error: mensajeDeError(error), campo: "categoria_id" };
  }

  return { ok: true, datos: (creada as { id: string }).id };
}

/**
 * Guarda la tasa del día en `tipos_cambio` si aún no estaba.
 * No es crítico: si falla, el movimiento se guarda igual con su propia tasa.
 */
async function registrarTasa(
  supabase: ClienteSupabase,
  fecha: string,
  tasa: number,
) {
  const { data: existente } = await supabase
    .from("tipos_cambio")
    .select("id")
    .eq("fecha", fecha)
    .eq("divisa", "USD")
    .maybeSingle();

  if (existente) return;

  await supabase
    .from("tipos_cambio")
    .insert({ fecha, divisa: "USD", tasa_a_eur: redondear6(tasa) });
}

/**
 * Traduce los datos validados a la fila que espera la tabla.
 *
 * Tienda y medio de pago van siempre explícitos: desde la 0019 no hay tienda
 * por defecto, y un movimiento sin ella sería de General sin que nadie lo
 * haya decidido. Nunca se escribe `cuenta_pago` (la borra la 0019).
 */
function construirFila(
  datos: DatosMovimiento,
  categoriaId: string,
  creadoPor: string,
): FilaInsertMovimiento {
  const tasa = datos.divisa === "EUR" ? 1 : redondear6(datos.tasa_cambio);
  const esGasto = datos.tipo === "gasto";
  const medio = esGasto ? datos.medio_pago : null;

  return {
    tipo: datos.tipo,
    fecha: datos.fecha,
    concepto: datos.concepto.trim(),
    categoria_id: categoriaId,
    divisa: datos.divisa,
    base_imponible: redondear2(datos.base_imponible),
    iva_tipo: datos.iva_tipo,
    iva_importe: redondear2(datos.iva_importe),
    total: redondear2(datos.total),
    tasa_cambio: tasa,
    total_eur: convertirAEuros(datos.total, tasa),
    base_eur: convertirAEuros(datos.base_imponible, tasa),
    tienda_id: datos.tienda_id,
    medio_pago: medio,
    // Solo «bolsillo» lleva el socio que elige el usuario. Con la tarjeta lo
    // pone el trigger (el titular, siempre); con banco o PayPal, y en los
    // ingresos, no hay nadie que adelante dinero.
    anticipado_por: medio === "bolsillo" ? datos.anticipado_por : null,
    num_pedidos: datos.num_pedidos ?? null,
    plataforma: datos.plataforma ?? null,
    impresiones: datos.impresiones ?? null,
    clicks: datos.clicks ?? null,
    notas: datos.notas?.trim() || null,
    created_by: creadoPor,
  };
}

function revalidar() {
  revalidatePath("/movimientos");
  revalidatePath("/diario");
  revalidatePath("/categorias");
  // Un gasto con tarjeta o de bolsillo mueve el cupo y la liquidación.
  revalidatePath("/liquidacion");
  revalidatePath("/");
}

export async function crearMovimiento(
  entrada: unknown,
): Promise<Resultado<{ id: string }>> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaMovimiento.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const datos = validacion.data;

  const categoria = await resolverCategoria(supabase, datos);
  if (!categoria.ok) return categoria;

  if (datos.divisa === "USD") {
    await registrarTasa(supabase, datos.fecha, datos.tasa_cambio);
  }

  const { data, error } = await supabase
    .from("movimientos")
    .insert(construirFila(datos, categoria.datos!, usuario.id))
    .select("id")
    .single();

  if (error || !data) return { ok: false, ...errorDeBase(error) };

  revalidar();
  return { ok: true, datos: { id: (data as { id: string }).id } };
}

export async function actualizarMovimiento(
  id: string,
  entrada: unknown,
): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaMovimiento.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const datos = validacion.data;

  const categoria = await resolverCategoria(supabase, datos);
  if (!categoria.ok) return categoria;

  if (datos.divisa === "USD") {
    await registrarTasa(supabase, datos.fecha, datos.tasa_cambio);
  }

  const fila = construirFila(datos, categoria.datos!, usuario.id);
  // created_by es de quien lo dio de alta; una edición no cambia la autoría.
  const { created_by: _autoria, ...cambios } = fila;
  void _autoria;

  // `.select()` obliga a PostgREST a devolver las filas tocadas. Si la RLS
  // bloqueó, vienen cero y aquí no se canta un éxito que no ha pasado.
  const { data: tocadas, error } = await supabase
    .from("movimientos")
    .update(cambios)
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, ...errorDeBase(error) };

  if (!tocadas || tocadas.length === 0) {
    return {
      ok: false,
      error:
        (await comprobarAutoria(supabase, id, usuario.id)) ??
        "No se ha podido guardar el cambio.",
    };
  }

  revalidar();
  return { ok: true };
}

export async function eliminarMovimiento(id: string): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data: borradas, error } = await supabase
    .from("movimientos")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: mensajeDeError(error) };

  if (!borradas || borradas.length === 0) {
    return {
      ok: false,
      error:
        (await comprobarAutoria(supabase, id, usuario.id)) ??
        "No se ha podido eliminar el movimiento.",
    };
  }

  revalidar();
  return { ok: true };
}

export async function marcarReembolsado(
  id: string,
  reembolsado: boolean,
): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  // Por RPC y no con un UPDATE directo: marcar un reembolso es parte de la
  // liquidación conjunta, así que los dos socios pueden hacerlo sobre
  // cualquier gasto. Un UPDATE se lo comería la política de autoría (0012) y,
  // peor, lo haría en silencio. La función acotada vive en la 0014.
  const { error } = await supabase.rpc("fn_marcar_reembolsado", {
    p_movimiento: id,
    p_reembolsado: reembolsado,
  });

  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

/**
 * Registro diario de ventas, desglosado por método de cobro (0017), de UNA
 * tienda (0018): el duplicado se detecta dentro de esa tienda.
 *
 * Cada método con importe genera su propio ingreso en «Ventas Shopify», con
 * su `metodo_cobro`. Lo hace `fn_registrar_ventas_dia` en una transacción:
 * si ya hay ventas ese día devuelve `duplicado` sin tocar nada, y solo las
 * sustituye cuando el usuario lo confirma. Duplicar un día falsea la caja.
 */
export async function registrarVentaDiaria(
  entrada: unknown,
): Promise<Resultado<{ duplicado?: boolean }>> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const validacion = esquemaVentaDiaria.safeParse(entrada);
  if (!validacion.success) {
    const primero = validacion.error.issues[0];
    return {
      ok: false,
      error: primero?.message ?? "Los datos no son válidos.",
      campo: primero?.path?.[0]?.toString(),
    };
  }

  const datos: DatosVentaDiaria = validacion.data;
  const tasa = datos.divisa === "EUR" ? 1 : redondear6(datos.tasa_cambio);

  if (datos.divisa === "USD") {
    await registrarTasa(supabase, datos.fecha, tasa);
  }

  const { data, error } = await supabase.rpc("fn_registrar_ventas_dia", {
    p_tienda: datos.tienda_id,
    p_fecha: datos.fecha,
    p_divisa: datos.divisa,
    p_tasa: tasa,
    p_shopify_importe: redondear2(datos.shopify_importe),
    p_shopify_pedidos: datos.shopify_pedidos,
    p_paypal_importe: redondear2(datos.paypal_importe),
    p_paypal_pedidos: datos.paypal_pedidos,
    p_sobrescribir: datos.sobrescribir ?? false,
  });

  if (error) return { ok: false, error: mensajeDeError(error) };

  const respuesta = (data ?? {}) as { duplicado?: boolean };
  if (respuesta.duplicado) return { ok: true, datos: { duplicado: true } };

  revalidar();
  return { ok: true, datos: {} };
}

/**
 * Cierra el aviso de /diario sobre los días anteriores al desglose: ya se
 * revisaron a mano los que tuvieron ventas por PayPal.
 */
export async function marcarRevisionMetodosHecha(): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data: fila, error: errorLectura } = await supabase
    .from("ajustes")
    .select("valor")
    .eq("clave", "revision_metodo_cobro")
    .maybeSingle();

  if (errorLectura) return { ok: false, error: mensajeDeError(errorLectura) };
  if (!fila) return { ok: true };

  const valor = (fila.valor ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("ajustes")
    .update({
      valor: {
        ...valor,
        revisado: true,
        revisado_el: new Date().toISOString().slice(0, 10),
      },
    })
    .eq("clave", "revision_metodo_cobro");

  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidatePath("/diario");
  return { ok: true };
}
