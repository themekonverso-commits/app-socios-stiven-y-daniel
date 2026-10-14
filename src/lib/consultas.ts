import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";
import {
  FILAS_POR_PAGINA,
  type Filtros,
} from "@/lib/esquemas/filtros";
import type {
  Categoria,
  CategoriaConUso,
  MovimientoConRelaciones,
  Perfil,
  TipoMovimiento,
} from "@/lib/tipos-db";
import { redondear2 } from "@/lib/dinero";
import type { MetodoCobro } from "@/lib/metodos-cobro";
import { filtrarPorAmbito, type Ambito } from "@/lib/ambito";

/**
 * Consultas de lectura. Todas se ejecutan en el servidor con la sesión del
 * usuario, así que la RLS sigue aplicando: nadie ve nada que no le toque.
 *
 * Los filtros se traducen a la consulta SQL. Nunca se traen todas las filas
 * para filtrarlas después.
 *
 * MULTI-TIENDA (0018). Toda función que lee `movimientos` o
 * `vw_ventas_cobertura` recibe como ÚLTIMO parámetro un `ambito` opcional:
 * con él filtra por la tienda (o solo General); sin él, lo ve todo. Es un
 * contrato con el dashboard, que las llama pasándoselo.
 */

/**
 * Columnas explícitas y no `*`: `cuenta_pago` sigue en la tabla hasta la 0019
 * y nada debe depender de ella.
 */
const SELECT_MOVIMIENTO = `
  id, tipo, fecha, concepto, categoria_id, divisa, base_imponible, iva_tipo,
  iva_importe, total, tasa_cambio, total_eur, base_eur, anticipado_por,
  medio_pago, tienda_id, metodo_cobro, reembolsado, fecha_reembolso,
  num_pedidos, plataforma, impresiones, clicks, notas, importacion_id,
  created_by, created_at, updated_at,
  categorias:categoria_id ( id, nombre, tipo, es_sistema ),
  anticipado:anticipado_por ( id, nombre, color ),
  autor:created_by ( id, nombre, color )
`;

/** Escapa los comodines de PostgREST en las búsquedas de texto libre. */
function escaparBusqueda(termino: string): string {
  return termino.replace(/[%_,()]/g, " ").trim();
}

/**
 * Interfaz mínima del constructor de consultas de PostgREST.
 *
 * Se declara a mano por dos razones: el cliente todavía no lleva los tipos
 * generados de la base de datos, y encadenar filtros a través de un helper
 * genérico hacía que TypeScript entrase en una instanciación de tipos infinita
 * (TS2589). Con esta interfaz los filtros viven en UN SOLO SITIO y los usan por
 * igual la tabla, los totales y la exportación a CSV, que es justo lo que no
 * puede descuadrarse.
 */
type Respuesta<T> = {
  data: T[] | null;
  count?: number | null;
  error: { message: string } | null;
};

interface Consulta<T> extends PromiseLike<Respuesta<T>> {
  gte(columna: string, valor: string): Consulta<T>;
  lte(columna: string, valor: string): Consulta<T>;
  eq(columna: string, valor: string | boolean): Consulta<T>;
  is(columna: string, valor: null): Consulta<T>;
  in(columna: string, valores: string[]): Consulta<T>;
  or(filtro: string): Consulta<T>;
  order(columna: string, opciones?: { ascending?: boolean }): Consulta<T>;
  range(desde: number, hasta: number): Consulta<T>;
}

/**
 * Aplica los filtros comunes a cualquier consulta sobre `movimientos`,
 * incluida la tienda. La lista, los totales y el CSV pasan por aquí: por eso
 * no pueden descuadrarse entre sí.
 */
function aplicarFiltros<T>(
  consulta: Consulta<T>,
  filtros: Filtros,
  ambito?: Ambito,
): Consulta<T> {
  let q = consulta.gte("fecha", filtros.desde).lte("fecha", filtros.hasta);

  if (ambito) q = filtrarPorAmbito(q, ambito);

  if (filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo);
  if (filtros.categorias.length > 0) q = q.in("categoria_id", filtros.categorias);

  if (filtros.anticipado !== "todos") {
    q =
      filtros.anticipado === "sin-asignar"
        ? q.is("anticipado_por", null)
        : q.eq("anticipado_por", filtros.anticipado);
  }

  // Quién lo REGISTRÓ, que no es lo mismo que quién puso el dinero.
  if (filtros.registrado !== "todos") {
    q = q.eq("created_by", filtros.registrado);
  }

  if (filtros.reembolso !== "todos") {
    q = q.eq("reembolsado", filtros.reembolso === "reembolsado");
  }

  // Solo los gastos tienen medio de pago: filtrar por él deja fuera los ingresos.
  if (filtros.medio !== "todos") q = q.eq("medio_pago", filtros.medio);

  const termino = escaparBusqueda(filtros.q);
  if (termino) {
    // Busca en el concepto y en las notas a la vez.
    q = q.or(`concepto.ilike.%${termino}%,notas.ilike.%${termino}%`);
  }

  return q;
}

export type ResultadoMovimientos = {
  filas: MovimientoConRelaciones[];
  total: number;
  paginas: number;
  error: string | null;
};

export async function obtenerMovimientos(
  filtros: Filtros,
  ambito?: Ambito,
): Promise<ResultadoMovimientos> {
  const supabase = await crearClienteServidor();

  const desde = (filtros.pagina - 1) * FILAS_POR_PAGINA;
  const hasta = desde + FILAS_POR_PAGINA - 1;

  const base = supabase
    .from("movimientos")
    .select(SELECT_MOVIMIENTO, { count: "exact" }) as unknown as Consulta<MovimientoConRelaciones>;

  const { data, count, error } = await aplicarFiltros(base, filtros, ambito)
    .order(filtros.orden, { ascending: filtros.direccion === "asc" })
    // Desempate estable: sin esto, dos filas del mismo día pueden bailar
    // entre páginas y aparecer repetidas o desaparecer.
    .order("created_at", { ascending: false })
    .range(desde, hasta);

  if (error) {
    return { filas: [], total: 0, paginas: 0, error: error.message };
  }

  const total = count ?? 0;

  return {
    filas: data ?? [],
    total,
    paginas: Math.max(1, Math.ceil(total / FILAS_POR_PAGINA)),
    error: null,
  };
}

export type TotalesFiltrados = {
  ingresos: number;
  gastos: number;
  resultado: number;
};

/**
 * Totales del conjunto FILTRADO completo, no solo de la página visible.
 *
 * PostgREST no sabe hacer SUM sin una función RPC, así que se traen únicamente
 * dos columnas de las filas ya filtradas por SQL y se suman aquí, en el
 * servidor. Al volumen de una tienda es instantáneo; si algún día creciera,
 * el siguiente paso es una función `sum` en Postgres.
 */
export async function obtenerTotales(
  filtros: Filtros,
  ambito?: Ambito,
): Promise<TotalesFiltrados> {
  const supabase = await crearClienteServidor();

  const base = supabase
    .from("movimientos")
    .select("tipo, total_eur") as unknown as Consulta<{
      tipo: TipoMovimiento;
      total_eur: number;
    }>;

  const { data, error } = await aplicarFiltros(base, filtros, ambito);

  if (error || !data) return { ingresos: 0, gastos: 0, resultado: 0 };

  let ingresos = 0;
  let gastos = 0;

  for (const fila of data) {
    const importe = Number(fila.total_eur) || 0;
    if (fila.tipo === "ingreso") ingresos += importe;
    else gastos += importe;
  }

  ingresos = redondear2(ingresos);
  gastos = redondear2(gastos);

  return { ingresos, gastos, resultado: redondear2(ingresos - gastos) };
}

/** Todas las filas filtradas, para exportar a CSV. Sin paginar. */
export async function obtenerMovimientosParaExportar(
  filtros: Filtros,
  ambito?: Ambito,
): Promise<MovimientoConRelaciones[]> {
  const supabase = await crearClienteServidor();

  const base = supabase
    .from("movimientos")
    .select(SELECT_MOVIMIENTO) as unknown as Consulta<MovimientoConRelaciones>;

  const { data, error } = await aplicarFiltros(base, filtros, ambito).order("fecha", {
    ascending: true,
  });

  if (error) return [];
  return data ?? [];
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    // Las de sistema primero por su campo `orden`, luego alfabético.
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) return [];
  return (data ?? []) as Categoria[];
}

/**
 * Categorías con su número de movimientos e importe acumulado.
 *
 * Las categorías son globales y /categorias las llama SIN ámbito: el número de
 * movimientos decide si una categoría se puede borrar, y tiene que contar los
 * de todas las tiendas.
 */
export async function obtenerCategoriasConUso(ambito?: Ambito): Promise<CategoriaConUso[]> {
  const supabase = await crearClienteServidor();

  const consultaMovimientos = supabase
    .from("movimientos")
    .select("categoria_id, total_eur") as unknown as Consulta<{
      categoria_id: string;
      total_eur: number;
    }>;

  const [{ data: categorias }, { data: movimientos }] = await Promise.all([
    supabase
      .from("categorias")
      .select("*")
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true }),
    ambito ? filtrarPorAmbito(consultaMovimientos, ambito) : consultaMovimientos,
  ]);

  const uso = new Map<string, { num: number; total: number }>();
  for (const fila of (movimientos ?? []) as unknown as {
    categoria_id: string;
    total_eur: number;
  }[]) {
    const actual = uso.get(fila.categoria_id) ?? { num: 0, total: 0 };
    actual.num += 1;
    actual.total += Number(fila.total_eur) || 0;
    uso.set(fila.categoria_id, actual);
  }

  return ((categorias ?? []) as Categoria[]).map((categoria) => {
    const datos = uso.get(categoria.id);
    return {
      ...categoria,
      num_movimientos: datos?.num ?? 0,
      total_eur: redondear2(datos?.total ?? 0),
    };
  });
}

export async function obtenerSocios(): Promise<Perfil[]> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) return [];
  return (data ?? []) as Perfil[];
}

/**
 * Conceptos ya usados, de más a menos frecuente, para el autocompletado.
 * PostgREST no tiene DISTINCT ni GROUP BY, así que se agrupan aquí sobre los
 * últimos movimientos, que es de donde saldrán las repeticiones útiles.
 */
export async function obtenerConceptosFrecuentes(
  limite = 80,
  ambito?: Ambito,
): Promise<string[]> {
  const supabase = await crearClienteServidor();

  const base = supabase
    .from("movimientos")
    .select("concepto") as unknown as Consulta<{ concepto: string }>;

  // Las 600 últimas filas: de ahí salen las repeticiones útiles.
  const { data, error } = await (ambito ? filtrarPorAmbito(base, ambito) : base)
    .order("created_at", { ascending: false })
    .range(0, 599);

  if (error || !data) return [];

  const frecuencia = new Map<string, number>();
  for (const fila of data) {
    const concepto = fila.concepto?.trim();
    if (!concepto) continue;
    frecuencia.set(concepto, (frecuencia.get(concepto) ?? 0) + 1);
  }

  return [...frecuencia.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, limite)
    .map(([concepto]) => concepto);
}

/** Tasa USD→EUR más reciente registrada. */
export async function obtenerUltimaTasa(): Promise<{
  fecha: string;
  tasa: number;
} | null> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("tipos_cambio")
    .select("fecha, tasa_a_eur")
    .eq("divisa", "USD")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const fila = data as unknown as { fecha: string; tasa_a_eur: number };
  return { fecha: fila.fecha, tasa: Number(fila.tasa_a_eur) };
}

/** Un movimiento concreto, para editar o duplicar. */
export async function obtenerMovimiento(
  id: string,
  ambito?: Ambito,
): Promise<MovimientoConRelaciones | null> {
  const supabase = await crearClienteServidor();

  const base = supabase
    .from("movimientos")
    .select(SELECT_MOVIMIENTO) as unknown as Consulta<MovimientoConRelaciones>;

  const { data, error } = await (ambito ? filtrarPorAmbito(base, ambito) : base)
    .eq("id", id)
    .range(0, 0);

  if (error || !data || data.length === 0) return null;
  return data[0] ?? null;
}

/**
 * Socio titular de la tarjeta del negocio (`ajustes.limite_aportacion`). Un
 * gasto pagado con la tarjeta queda siempre como anticipo suyo: lo fija el
 * trigger `normalizar_medio_pago`, y el formulario lo enseña bloqueado.
 */
export async function obtenerSocioTarjeta(): Promise<string | null> {
  const supabase = await crearClienteServidor();

  const { data } = await supabase
    .from("ajustes")
    .select("valor")
    .eq("clave", "limite_aportacion")
    .maybeSingle();

  const valor = (data?.valor ?? null) as { socio_id?: unknown } | null;
  const socio = typeof valor?.socio_id === "string" ? valor.socio_id.trim() : "";
  return socio || null;
}

/** Registro diario: los últimos N días de ventas de Shopify. */
export async function obtenerVentasDiarias(
  dias = 30,
  ambito?: Ambito,
): Promise<{
  filas: MovimientoConRelaciones[];
  error: string | null;
}> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  const desdeIso = desde.toISOString().slice(0, 10);

  const base = supabase
    .from("movimientos")
    .select(SELECT_MOVIMIENTO)
    .not("num_pedidos", "is", null) as unknown as Consulta<MovimientoConRelaciones>;

  const { data, error } = await (ambito ? filtrarPorAmbito(base, ambito) : base)
    .eq("tipo", "ingreso")
    .gte("fecha", desdeIso)
    .order("fecha", { ascending: false });

  if (error) return { filas: [], error: error.message };
  return { filas: data ?? [], error: null };
}

/** Ventas de un día, una tienda y un método, y si ya las cubre un cobro. */
export type CoberturaVentas = {
  fecha: string;
  /** Una venta siempre es de una tienda (CHECK de la 0018). */
  tiendaId: string | null;
  metodo: MetodoCobro;
  ventas: number;
  cubierta: boolean;
  cobroFecha: string | null;
};

/**
 * Cobertura de las ventas desde una fecha (vista `vw_ventas_cobertura`).
 * Alimenta el indicador «cobrado / pendiente» de cada día en /diario.
 */
export async function obtenerCoberturaVentas(
  dias = 30,
  ambito?: Ambito,
): Promise<CoberturaVentas[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));

  type FilaCobertura = {
    fecha: string | null;
    tienda_id: string | null;
    metodo_cobro: string | null;
    ventas: number | null;
    cubierta: boolean | null;
    cobro_fecha: string | null;
  };

  const base = supabase
    .from("vw_ventas_cobertura")
    .select("fecha, tienda_id, metodo_cobro, ventas, cubierta, cobro_fecha") as unknown as Consulta<FilaCobertura>;

  const { data, error } = await (ambito ? filtrarPorAmbito(base, ambito) : base).gte(
    "fecha",
    desde.toISOString().slice(0, 10),
  );

  if (error || !data) return [];

  return data.map((fila) => ({
    fecha: fila.fecha ?? "",
    tiendaId: fila.tienda_id ?? null,
    metodo: (fila.metodo_cobro === "paypal" ? "paypal" : "shopify_payments") as MetodoCobro,
    ventas: Number(fila.ventas ?? 0),
    cubierta: Boolean(fila.cubierta),
    cobroFecha: fila.cobro_fecha ?? null,
  }));
}

/** Un día con ventas registradas antes del desglose por método. */
export type DiaPorRevisar = {
  fecha: string;
  shopify: number;
  paypal: number;
};

/**
 * Días con ventas anteriores a la migración 0017. Se asignaron a Shopify
 * Payments por defecto; /diario los lista para revisar a mano los que
 * tuvieron PayPal. Devuelve null cuando ya se marcó como revisado.
 *
 * Con ámbito, solo cuenta los días que tienen ventas en ese ámbito: esos días
 * son todos de la primera tienda, y en una tienda nueva el aviso no pinta nada.
 */
export async function obtenerRevisionMetodos(ambito?: Ambito): Promise<{
  aplicado: string;
  dias: DiaPorRevisar[];
} | null> {
  const supabase = await crearClienteServidor();

  const { data: ajuste } = await supabase
    .from("ajustes")
    .select("valor")
    .eq("clave", "revision_metodo_cobro")
    .maybeSingle();

  const valor = (ajuste?.valor ?? null) as
    | { aplicado?: string; revisado?: boolean; dias?: string[] }
    | null;

  if (!valor || valor.revisado || !valor.dias?.length) return null;

  // Cómo están hoy esos días: si ya se corrigió uno, se ve con su PayPal.
  const base = supabase
    .from("vw_ventas_cobertura")
    .select("fecha, metodo_cobro, ventas") as unknown as Consulta<{
      fecha: string | null;
      metodo_cobro: string | null;
      ventas: number | null;
    }>;

  const { data } = await (ambito ? filtrarPorAmbito(base, ambito) : base).in(
    "fecha",
    valor.dias,
  );

  const porDia = new Map<string, DiaPorRevisar>(
    valor.dias.map((fecha) => [fecha, { fecha, shopify: 0, paypal: 0 }]),
  );
  const conVentas = new Set<string>();
  for (const fila of data ?? []) {
    const dia = porDia.get(fila.fecha ?? "");
    if (!dia) continue;
    conVentas.add(dia.fecha);
    if (fila.metodo_cobro === "paypal") dia.paypal += Number(fila.ventas ?? 0);
    else dia.shopify += Number(fila.ventas ?? 0);
  }

  const dias = [...porDia.values()]
    .filter((dia) => !ambito || conVentas.has(dia.fecha))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (dias.length === 0) return null;

  return { aplicado: valor.aplicado ?? "", dias };
}
