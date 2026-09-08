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
import { formatearFecha } from "@/lib/formato";
import type { FilaInsertMovimiento, TipoMovimiento } from "@/lib/tipos-db";

/**
 * Server Actions de movimientos.
 *
 * Toda escritura pasa por aquí; el navegador nunca habla directamente con
 * Supabase. Y todo entra otra vez por zod: la validación del formulario es
 * comodidad para quien escribe, no una garantía, porque estas funciones se
 * pueden invocar sin pasar por el formulario.
 */

export type Resultado<T = undefined> =
  | { ok: true; datos?: T }
  | { ok: false; error: string; campo?: string };

function mensajeDeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const mensaje = String((error as { message: unknown }).message);
    if (mensaje.includes("duplicate key")) {
      return "Ya existe un registro igual.";
    }
    if (mensaje.includes("violates foreign key")) {
      return "La categoría o el socio seleccionados ya no existen.";
    }
    if (mensaje.includes("row-level security")) {
      return "No tienes permiso para hacer esto.";
    }
    return mensaje;
  }
  return "Ha ocurrido un error inesperado.";
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

/** Traduce los datos validados a la fila que espera la tabla. */
function construirFila(
  datos: DatosMovimiento,
  categoriaId: string,
  creadoPor: string,
): FilaInsertMovimiento {
  const tasa = datos.divisa === "EUR" ? 1 : redondear6(datos.tasa_cambio);

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
    // En los ingresos no hay nadie que adelante dinero.
    anticipado_por: datos.tipo === "gasto" ? datos.anticipado_por : null,
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

  if (error || !data) return { ok: false, error: mensajeDeError(error) };

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

  const { error } = await supabase.from("movimientos").update(cambios).eq("id", id);

  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

export async function eliminarMovimiento(id: string): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { error } = await supabase.from("movimientos").delete().eq("id", id);
  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

export async function marcarReembolsado(
  id: string,
  reembolsado: boolean,
): Promise<Resultado> {
  const { supabase, usuario } = await exigirSesion();
  if (!usuario) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { error } = await supabase
    .from("movimientos")
    .update({
      reembolsado,
      fecha_reembolso: reembolsado ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: mensajeDeError(error) };

  revalidar();
  return { ok: true };
}

/**
 * Registro diario de ventas.
 *
 * Crea un ingreso en la categoría «Ventas Shopify» con el número de pedidos.
 * Si ya hay un registro para esa fecha lo dice, y solo lo sustituye cuando el
 * usuario lo confirma: duplicar las ventas de un día falsea toda la caja.
 */
export async function registrarVentaDiaria(
  entrada: unknown,
): Promise<Resultado<{ duplicado?: boolean; concepto?: string }>> {
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

  const { data: categoria } = await supabase
    .from("categorias")
    .select("id")
    .eq("tipo", "ingreso")
    .eq("nombre", "Ventas Shopify")
    .maybeSingle();

  if (!categoria) {
    return {
      ok: false,
      error:
        "No existe la categoría «Ventas Shopify». Créala en Categorías o ejecuta la migración.",
    };
  }

  const categoriaId = (categoria as { id: string }).id;

  const { data: existentes } = await supabase
    .from("movimientos")
    .select("id")
    .eq("fecha", datos.fecha)
    .eq("categoria_id", categoriaId)
    .not("num_pedidos", "is", null);

  const yaHay = (existentes ?? []) as { id: string }[];

  if (yaHay.length > 0 && !datos.sobrescribir) {
    return {
      ok: true,
      datos: { duplicado: true, concepto: formatearFecha(datos.fecha) },
    };
  }

  const tasa = datos.divisa === "EUR" ? 1 : redondear6(datos.tasa_cambio);
  const total = redondear2(datos.ingresos);

  const fila: FilaInsertMovimiento = {
    tipo: "ingreso" as TipoMovimiento,
    fecha: datos.fecha,
    concepto: `Ventas del ${formatearFecha(datos.fecha)}`,
    categoria_id: categoriaId,
    divisa: datos.divisa,
    // Las ventas se registran por su importe bruto: el desglose de IVA de las
    // ventas lo hace la gestoría, no esta pantalla.
    base_imponible: total,
    iva_tipo: 0,
    iva_importe: 0,
    total,
    tasa_cambio: tasa,
    total_eur: convertirAEuros(total, tasa),
    base_eur: convertirAEuros(total, tasa),
    anticipado_por: null,
    num_pedidos: datos.num_pedidos,
    plataforma: null,
    impresiones: null,
    clicks: null,
    notas: null,
    created_by: usuario.id,
  };

  if (yaHay.length > 0) {
    // Sustituye: actualiza el primero y borra los sobrantes, si los hubiera.
    const [primero, ...sobrantes] = yaHay;
    const { created_by: _autoria, ...cambios } = fila;
    void _autoria;

    const { error } = await supabase
      .from("movimientos")
      .update(cambios)
      .eq("id", primero!.id);

    if (error) return { ok: false, error: mensajeDeError(error) };

    if (sobrantes.length > 0) {
      await supabase
        .from("movimientos")
        .delete()
        .in("id", sobrantes.map((fila) => fila.id));
    }
  } else {
    const { error } = await supabase.from("movimientos").insert(fila);
    if (error) return { ok: false, error: mensajeDeError(error) };
  }

  revalidar();
  return { ok: true, datos: {} };
}
