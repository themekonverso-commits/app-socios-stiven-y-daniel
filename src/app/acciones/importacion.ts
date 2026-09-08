"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { redondear2 } from "@/lib/dinero";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Importación de CSV.
 *
 * La validación se hace en el SERVIDOR porque la parte más importante —saber
 * si una fila ya existe— necesita consultar la base de datos. El navegador solo
 * lee el archivo y propone el mapeo.
 */

const UUID = z.uuid();

export type EstadoFila = "ok" | "duplicado" | "error";

export type FilaValidada = {
  indice: number;
  fecha: string | null;
  concepto: string;
  importe: number | null;
  divisa: string;
  num_pedidos: number | null;
  estado: EstadoFila;
  motivo: string | null;
};

const esquemaFila = z.object({
  indice: z.number().int().min(0),
  fecha: z.string().nullable(),
  concepto: z.string().max(200),
  importe: z.number().nullable(),
  divisa: z.string().max(8),
  num_pedidos: z.number().int().nullable(),
});

const esquemaValidacion = z.object({
  filas: z.array(esquemaFila).max(5000, "Máximo 5.000 filas por importación."),
  tipo: z.enum(["ingreso", "gasto"]),
});

/**
 * Marca cada fila como lista, duplicada o errónea.
 *
 * Un duplicado es un movimiento que ya existe con la MISMA fecha, concepto e
 * importe. Es la comprobación que evita el error más caro de una importación:
 * volcar dos veces el mismo archivo y duplicar la facturación de un mes.
 */
export async function validarImportacion(
  entrada: unknown,
): Promise<Resultado<{ filas: FilaValidada[] }>> {
  const validacion = esquemaValidacion.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const { filas, tipo } = validacion.data;
  const supabase = await crearClienteServidor();

  // Se consultan solo los movimientos del rango de fechas del archivo, no la
  // tabla entera.
  const fechas = filas.map((f) => f.fecha).filter(Boolean) as string[];
  const desde = fechas.length > 0 ? fechas.reduce((a, b) => (a < b ? a : b)) : null;
  const hasta = fechas.length > 0 ? fechas.reduce((a, b) => (a > b ? a : b)) : null;

  const existentes = new Set<string>();

  if (desde && hasta) {
    const { data } = await supabase
      .from("movimientos")
      .select("fecha, concepto, total")
      .eq("tipo", tipo)
      .gte("fecha", desde)
      .lte("fecha", hasta);

    for (const fila of data ?? []) {
      existentes.add(
        `${fila.fecha}|${String(fila.concepto).trim().toLowerCase()}|${redondear2(Number(fila.total))}`,
      );
    }
  }

  // Los duplicados dentro del propio archivo también cuentan.
  const vistas = new Set<string>();

  const resultado: FilaValidada[] = filas.map((fila) => {
    const base = { ...fila, estado: "ok" as EstadoFila, motivo: null as string | null };

    if (!fila.fecha) {
      return { ...base, estado: "error", motivo: "Fecha no reconocida" };
    }
    if (fila.importe === null) {
      return { ...base, estado: "error", motivo: "Importe no numérico" };
    }
    if (fila.importe <= 0) {
      return { ...base, estado: "error", motivo: "El importe debe ser mayor que cero" };
    }
    if (fila.divisa !== "EUR" && fila.divisa !== "USD") {
      return { ...base, estado: "error", motivo: `Divisa desconocida: ${fila.divisa}` };
    }

    const clave = `${fila.fecha}|${fila.concepto.trim().toLowerCase()}|${redondear2(fila.importe)}`;

    if (existentes.has(clave)) {
      return { ...base, estado: "duplicado", motivo: "Ya existe un movimiento igual" };
    }
    if (vistas.has(clave)) {
      return { ...base, estado: "duplicado", motivo: "Repetida dentro del propio archivo" };
    }

    vistas.add(clave);
    return base;
  });

  return { ok: true, datos: { filas: resultado } };
}

const esquemaImportacion = z.object({
  nombre_archivo: z.string().trim().min(1).max(200),
  origen: z.string().trim().max(60).nullable().optional(),
  categoria_id: UUID,
  tipo: z.enum(["ingreso", "gasto"]),
  tasa_cambio: z.number().positive().max(1000),
  filas_totales: z.number().int().min(0),
  filas_omitidas: z.number().int().min(0),
  filas: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        concepto: z.string().max(200),
        importe: z.number().positive(),
        divisa: z.enum(["EUR", "USD"]),
        num_pedidos: z.number().int().min(0).nullable(),
      }),
    )
    .min(1, "No hay ninguna fila que importar.")
    .max(5000),
});

/** Ejecuta la importación. La transacción la garantiza la función SQL. */
export async function ejecutarImportacion(
  entrada: unknown,
): Promise<Resultado<{ creados: number; importe_total_eur: number }>> {
  const validacion = esquemaImportacion.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const datos = validacion.data;
  const supabase = await crearClienteServidor();

  const filas = datos.filas.map((fila) => ({
    fecha: fila.fecha,
    concepto: fila.concepto,
    categoria_id: datos.categoria_id,
    tipo: datos.tipo,
    divisa: fila.divisa,
    importe: fila.importe,
    tasa_cambio: fila.divisa === "USD" ? datos.tasa_cambio : 1,
    num_pedidos: fila.num_pedidos,
  }));

  const { data, error } = await supabase.rpc("fn_importar_movimientos", {
    p_nombre_archivo: datos.nombre_archivo,
    p_origen: datos.origen ?? "CSV",
    p_filas: filas,
    p_filas_totales: datos.filas_totales,
    p_filas_omitidas: datos.filas_omitidas,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/importar");
  revalidatePath("/movimientos");
  revalidatePath("/kpis");
  revalidatePath("/");

  return {
    ok: true,
    datos: data as unknown as { creados: number; importe_total_eur: number },
  };
}

export async function deshacerImportacion(
  id: string,
): Promise<Resultado<{ borrados: number }>> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_deshacer_importacion", {
    p_importacion: id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/importar");
  revalidatePath("/movimientos");
  revalidatePath("/kpis");
  revalidatePath("/");

  return { ok: true, datos: data as unknown as { borrados: number } };
}

const esquemaMapeo = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre al mapeo.").max(60),
  origen: z.string().trim().max(60).nullable().optional(),
  // El tipo `Json` de Supabase no admite `unknown`: se declara con los
  // valores que de verdad guarda un mapeo (nombres de columna).
  config: z.record(z.string(), z.string().nullable()),
});

export async function guardarMapeo(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const validacion = esquemaMapeo.safeParse(entrada);
  if (!validacion.success) {
    return {
      ok: false,
      error: validacion.error.issues[0]?.message ?? "Los datos no son válidos.",
    };
  }

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };

  const { data, error } = await supabase
    .from("mapeos_importacion")
    .insert({
      nombre: validacion.data.nombre,
      origen: validacion.data.origen ?? null,
      config: validacion.data.config,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar." };

  revalidatePath("/importar");
  return { ok: true, datos: { id: String(data.id) } };
}

export async function eliminarMapeo(id: string): Promise<Resultado> {
  if (!UUID.safeParse(id).success) return { ok: false, error: "Identificador no válido." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("mapeos_importacion").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/importar");
  return { ok: true };
}
