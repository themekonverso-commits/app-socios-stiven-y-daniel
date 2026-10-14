import { cookies } from "next/headers";
import { CreditCard, SearchX } from "lucide-react";

import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { EstadoVacio } from "@/components/estado-vacio";
import { AvisosRenovacion } from "@/components/cuentas/avisos-renovacion";
import { BarraFiltrosCuentas } from "@/components/cuentas/barra-filtros-cuentas";
import { ListaCuentas } from "@/components/cuentas/lista-cuentas";
import {
  BotonNuevaCuenta,
  ProveedorCuentas,
} from "@/components/cuentas/proveedor-cuentas";
import { ResumenCuentasCabecera } from "@/components/cuentas/resumen-cuentas";
import {
  hayFiltrosCuentasActivos,
  leerFiltrosCuentas,
} from "@/lib/esquemas/cuentas";
import {
  obtenerCuentas,
  obtenerResumenCuentas,
  obtenerTiposUsados,
} from "@/lib/consultas-cuentas";
import { obtenerCategorias, obtenerSocios, obtenerUltimaTasa } from "@/lib/consultas";
import { obtenerUsuarioActual } from "@/lib/consultas-liquidacion";
import { obtenerAmbito } from "@/lib/tiendas";

export const metadata = { title: "Cuentas y activos" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaCuentas({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;

  // La preferencia de vista viaja en cookie, no en localStorage: así el
  // servidor ya renderiza la vista correcta sin parpadeo.
  const galletas = await cookies();
  const vistaGuardada = galletas.get("vista_cuentas")?.value;
  const filtros = leerFiltrosCuentas(
    params,
    vistaGuardada === "tabla" ? "tabla" : "tarjetas",
  );

  // Multi-tienda (0018): la tienda activa, General (tienda_id NULL) o todas.
  const ambito = await obtenerAmbito();

  const [cuentas, resumen, socios, categorias, tipos, usuarioId, tasa] =
    await Promise.all([
      obtenerCuentas(filtros, ambito),
      obtenerResumenCuentas(ambito),
      obtenerSocios(),
      obtenerCategorias(),
      obtenerTiposUsados(),
      obtenerUsuarioActual(),
      obtenerUltimaTasa(),
    ]);

  const conFiltros = hayFiltrosCuentasActivos(filtros);

  return (
    <ProveedorCuentas
      socios={socios}
      categorias={categorias}
      tiposUsados={tipos}
      usuarioId={usuarioId ?? ""}
      tasaUsd={tasa?.tasa ?? null}
    >
      <div className="flex flex-col gap-5">
        <EncabezadoPagina
          titulo="Cuentas y activos"
          descripcion="Qué existe, a nombre de quién está y cuánto cuesta. Sin contraseñas."
          acciones={<BotonNuevaCuenta />}
        />

        <ResumenCuentasCabecera resumen={resumen} />

        <AvisosRenovacion
          vencidas={resumen.vencidas}
          proximas={resumen.proximas}
        />

        <BarraFiltrosCuentas
          filtros={filtros}
          socios={socios}
          tipos={tipos.length > 0 ? tipos : []}
        />

        {cuentas.length === 0 ? (
          conFiltros ? (
            <EstadoVacio
              icono={SearchX}
              titulo="Ninguna cuenta con estos filtros"
              descripcion="Prueba a quitar algún filtro o a buscar otra cosa."
            />
          ) : (
            <EstadoVacio
              icono={CreditCard}
              titulo={
                ambito.tipo === "todas" ? "El inventario está vacío" : "Ninguna cuenta en esta vista"
              }
              descripcion={
                ambito.tipo === "todas"
                  ? "Apunta aquí las plataformas, dominios y herramientas del negocio. El día que uno de los dos salga, o que vendáis la marca, este inventario es el activo."
                  : ambito.tipo === "general"
                    ? "Aquí van las cuentas compartidas por todas las tiendas, como Claude o Apimart. Las de cada tienda se ven al elegirla en el selector."
                    : "Esta tienda todavía no tiene cuentas. Las compartidas por todas están en General / Sociedad."
              }
              accion={<BotonNuevaCuenta />}
            />
          )
        ) : (
          <ListaCuentas cuentas={cuentas} vista={filtros.vista} />
        )}
      </div>
    </ProveedorCuentas>
  );
}
