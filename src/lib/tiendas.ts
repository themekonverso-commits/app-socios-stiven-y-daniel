import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
  COOKIE_TIENDA,
  aTienda,
  resolverAmbito,
  type Ambito,
  type Tienda,
} from "@/lib/ambito";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Todas las tiendas, archivadas incluidas (el consolidado y /tiendas las
 * necesitan). Ordenadas: activas, pausadas y archivadas; dentro, por fecha de
 * lanzamiento. `cache` evita repetir la consulta en el mismo render: la piden
 * el layout y la página.
 */
export const obtenerTiendas = cache(async (): Promise<Tienda[]> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("tiendas")
    .select(
      "id, nombre, slug, color, estado, url_shopify, fecha_lanzamiento, objetivo_mes, notas, created_by",
    )
    .order("fecha_lanzamiento", { ascending: true, nullsFirst: false })
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las tiendas: ${error.message}`);

  const orden = { activa: 0, pausada: 1, archivada: 2 } as const;
  return (data ?? [])
    .map(aTienda)
    .sort((a, b) => orden[a.estado] - orden[b.estado]);
});

/**
 * El ámbito activo. Sale de la cookie, que el middleware sincroniza con el
 * parámetro `?tienda=` de la URL antes de que llegue la petición a la página.
 */
export const obtenerAmbito = cache(async (): Promise<Ambito> => {
  const [almacen, tiendas] = await Promise.all([cookies(), obtenerTiendas()]);
  return resolverAmbito(almacen.get(COOKIE_TIENDA)?.value, tiendas);
});
