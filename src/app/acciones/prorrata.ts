"use server";

import { z } from "zod";

import { crearClienteServidor } from "@/lib/supabase/server";
import { registrarReembolso } from "@/app/acciones/liquidacion";
import type { Resultado } from "@/app/acciones/movimientos";

/**
 * Prorrata (R3.2).
 *
 * El cálculo vive en Postgres. Al registrar, cada socio recibe su importe
 * aplicado a SUS anticipos, del más antiguo al más reciente: es el orden en el
 * que toca devolver.
 */

export async function calcularProrrataAccion(
  disponible: number,
): Promise<Resultado<Record<string, number>>> {
  if (!Number.isFinite(disponible) || disponible <= 0) {
    return { ok: false, error: "El importe disponible debe ser mayor que cero." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_prorrata_reembolso", {
    p_disponible: disponible,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, datos: (data ?? {}) as unknown as Record<string, number> };
}

const esquema = z.record(z.uuid(), z.number().finite().min(0));

/** Registra de una vez el reembolso que le toca a cada socio. */
export async function registrarReembolsosProrrata(
  fecha: string,
  reparto: unknown,
): Promise<Resultado<{ registrados: number }>> {
  const validacion = esquema.safeParse(reparto);
  if (!validacion.success) {
    return { ok: false, error: "El reparto recibido no es válido." };
  }

  const supabase = await crearClienteServidor();
  let registrados = 0;

  for (const [socioId, importe] of Object.entries(validacion.data)) {
    if (importe <= 0) continue;

    // Anticipos de ese socio, del más antiguo al más reciente.
    const { data: pendientes } = await supabase
      .from("vw_anticipos_pendientes")
      .select("id, pendiente_eur")
      .eq("socio_id", socioId)
      .order("fecha", { ascending: true });

    const lineas: { movimiento_id: string; importe_eur: number }[] = [];
    let restante = Math.round(importe * 100);

    for (const fila of pendientes ?? []) {
      if (restante <= 0) break;
      const disponible = Math.round(Number(fila.pendiente_eur) * 100);
      const aplicado = Math.min(disponible, restante);
      if (aplicado <= 0) continue;

      lineas.push({
        movimiento_id: String(fila.id),
        importe_eur: aplicado / 100,
      });
      restante -= aplicado;
    }

    if (lineas.length === 0) continue;

    const resultado = await registrarReembolso({
      socio_id: socioId,
      fecha,
      importe: lineas.reduce((s, l) => s + l.importe_eur, 0),
      metodo: "transferencia",
      notas: "Reembolso a prorrata (Regla 3 del contrato).",
      lineas,
    });

    if (!resultado.ok) return resultado;
    registrados += 1;
  }

  if (registrados === 0) {
    return { ok: false, error: "No había anticipos a los que aplicar el reparto." };
  }

  return { ok: true, datos: { registrados } };
}
