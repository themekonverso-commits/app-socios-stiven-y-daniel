"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  PARAM_TIENDA,
  conTienda,
  resolverAmbito,
  type Ambito,
  type Tienda,
} from "@/lib/ambito";

type ContextoTiendas = {
  /** Todas las tiendas, archivadas incluidas. */
  tiendas: Tienda[];
  /** El ámbito que eligió el servidor (cookie). Se usa si la URL no trae nada. */
  slugServidor: string;
};

const Contexto = createContext<ContextoTiendas | null>(null);

/**
 * Lista de tiendas para los componentes de cliente. La carga el layout una vez;
 * tras crear o editar una tienda, `router.refresh()` la vuelve a pedir.
 */
export function ProveedorTiendas({
  tiendas,
  slugServidor,
  children,
}: ContextoTiendas & { children: React.ReactNode }) {
  const valor = useMemo(() => ({ tiendas, slugServidor }), [tiendas, slugServidor]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useContexto(): ContextoTiendas {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useTiendas() fuera de <ProveedorTiendas>.");
  return ctx;
}

export function useTiendas(): Tienda[] {
  return useContexto().tiendas;
}

/**
 * El ámbito activo en el cliente. Lo lee de la URL (el middleware garantiza
 * que la lleva) y, si no, del que resolvió el servidor.
 */
export function useAmbito(): Ambito {
  const { tiendas, slugServidor } = useContexto();
  const params = useSearchParams();
  const slug = params.get(PARAM_TIENDA) ?? slugServidor;
  return useMemo(() => resolverAmbito(slug, tiendas), [slug, tiendas]);
}

/** Cambia de ámbito conservando la pantalla y el resto de filtros. */
export function useCambiarAmbito() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (slug: string, destino?: string) => {
      const query = params.toString();
      const actual = destino ?? (query ? `${pathname}?${query}` : pathname);
      router.push(conTienda(actual, slug), { scroll: false });
    },
    [router, pathname, params],
  );
}

/** Un href interno con la tienda activa ya puesta. */
export function useHrefConTienda() {
  const ambito = useAmbito();
  return useCallback((href: string) => conTienda(href, ambito.slug), [ambito.slug]);
}
