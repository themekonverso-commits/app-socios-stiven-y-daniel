import "server-only";

import { aCupoTarjeta, type CupoTarjeta } from "@/lib/cupo";
import { crearClienteServidor } from "@/lib/supabase/server";

/** El cupo de la tarjeta, global. Ver lib/cupo.ts. */
export async function obtenerCupoTarjeta(): Promise<CupoTarjeta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("fn_cupo_tarjeta");
  if (error) throw new Error(`No se pudo calcular el cupo de la tarjeta: ${error.message}`);
  return aCupoTarjeta(data);
}
