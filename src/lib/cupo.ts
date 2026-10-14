/**
 * Cupo de la tarjeta de crédito (R6). Global: el mismo número se mire desde la
 * tienda que se mire. Lo calcula `fn_cupo_tarjeta()` (migración 0018): suma de
 * los gastos con medio_pago = 'tarjeta_daniel' de todas las tiendas y de
 * General, contra ajustes.limite_aportacion.importe.
 */

export type CupoPorTienda = {
  tienda_id: string | null;
  nombre: string;
  color: string | null;
  consumido: number;
  num: number;
};

export type CupoTarjeta = {
  limite: number;
  socio_id: string | null;
  socio_nombre: string | null;
  /** Umbral ámbar, en %. El rojo es siempre el 100 %. */
  aviso_pct: number;
  consumido: number;
  disponible: number;
  pct: number | null;
  num_gastos: number;
  por_tienda: CupoPorTienda[];
};

export type NivelCupo = "ok" | "aviso" | "superado";

export function nivelCupo(cupo: CupoTarjeta): NivelCupo {
  const pct = cupo.pct ?? 0;
  if (pct >= 100) return "superado";
  if (pct >= cupo.aviso_pct) return "aviso";
  return "ok";
}

/** Normaliza el jsonb que devuelve la función. */
export function aCupoTarjeta(datos: unknown): CupoTarjeta {
  const d = (datos ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const filas = Array.isArray(d.por_tienda) ? (d.por_tienda as Record<string, unknown>[]) : [];
  return {
    limite: n(d.limite),
    socio_id: typeof d.socio_id === "string" ? d.socio_id : null,
    socio_nombre: typeof d.socio_nombre === "string" ? d.socio_nombre : null,
    aviso_pct: d.aviso_pct == null ? 80 : n(d.aviso_pct),
    consumido: n(d.consumido),
    disponible: n(d.disponible),
    pct: d.pct == null ? null : n(d.pct),
    num_gastos: n(d.num_gastos),
    por_tienda: filas.map((f) => ({
      tienda_id: typeof f.tienda_id === "string" ? f.tienda_id : null,
      nombre: String(f.nombre ?? ""),
      color: typeof f.color === "string" ? f.color : null,
      consumido: n(f.consumido),
      num: n(f.num),
    })),
  };
}
