import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { GestorTiendas, type MetricasTienda } from "@/components/tiendas/gestor-tiendas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerTiendas } from "@/lib/tiendas";
import { hoyEnEspana } from "@/lib/periodo";
import { format } from "date-fns";

export const metadata = { title: "Tiendas" };

/**
 * Gestión de tiendas: alta, edición, pausa y archivo, con la facturación y el
 * beneficio acumulados de cada una desde siempre.
 */
export default async function PaginaTiendas() {
  const supabase = await crearClienteServidor();
  const hoy = format(hoyEnEspana(), "yyyy-MM-dd");

  const [tiendas, comparativa, usuario] = await Promise.all([
    obtenerTiendas(),
    supabase.rpc("fn_comparativa_tiendas", { p_desde: "2000-01-01", p_hasta: hoy }),
    supabase.auth.getUser(),
  ]);

  if (comparativa.error) {
    throw new Error(`No se pudo calcular la facturación por tienda: ${comparativa.error.message}`);
  }

  const metricas: Record<string, MetricasTienda> = {};
  let general: MetricasTienda = { ingresos: 0, gastos: 0, beneficio: 0 };
  for (const fila of comparativa.data ?? []) {
    const m = {
      ingresos: Number(fila.ingresos),
      gastos: Number(fila.gastos),
      beneficio: Number(fila.beneficio),
    };
    if (fila.tienda_id) metricas[fila.tienda_id] = m;
    else general = m;
  }

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        alcance="global"
        titulo="Tiendas"
        descripcion="Cada tienda lleva sus números. Una tienda con datos no se borra: se archiva."
      />
      <GestorTiendas
        tiendas={tiendas}
        metricas={metricas}
        general={general}
        usuarioId={usuario.data.user?.id ?? ""}
      />
    </div>
  );
}
