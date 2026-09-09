/**
 * Tipos del dominio, derivados de los tipos GENERADOS por Supabase.
 *
 * La fuente de verdad es `src/types/database.ts`, que se regenera desde el
 * esquema remoto (ver README, sección «Migraciones»):
 *
 *   npm run db:types
 *
 * Este archivo no duplica nada: solo pone nombres en español a las filas
 * generadas y afina los pocos campos que en Postgres son `text` con un
 * CHECK. El generador no puede saber que `tipo` solo admite dos valores
 * —eso vive en la restricción, no en el tipo de la columna—, así que se
 * declara aquí y el compilador nos cubre las ramas de los `if`.
 */
import type { Database } from "@/types/database";

type Tablas = Database["public"]["Tables"];

/** Valores admitidos por los CHECK del esquema. */
export type TipoMovimiento = "ingreso" | "gasto";
export type Divisa = "EUR" | "USD";

/** Unions propias de la aplicación, no del esquema. */
export type TipoIva = 21 | 10 | 4 | 0;
export type Plataforma = "Meta" | "TikTok" | "Google" | "Otra";

export type Perfil = Tablas["profiles"]["Row"];

export type Categoria = Omit<Tablas["categorias"]["Row"], "tipo"> & {
  tipo: TipoMovimiento;
};

export type TipoCambio = Omit<Tablas["tipos_cambio"]["Row"], "divisa"> & {
  divisa: "USD";
};

export type Movimiento = Omit<
  Tablas["movimientos"]["Row"],
  "tipo" | "divisa"
> & {
  tipo: TipoMovimiento;
  divisa: Divisa;
};

export type CuentaActivo = Tablas["cuentas_activos"]["Row"];
export type Nota = Tablas["notas"]["Row"];
export type Integracion = Tablas["integraciones"]["Row"];

/** Movimiento tal y como llega de la consulta con sus relaciones resueltas. */
export type MovimientoConRelaciones = Movimiento & {
  categorias: Pick<Categoria, "id" | "nombre" | "tipo" | "es_sistema"> | null;
  /** Quién puso el dinero. */
  anticipado: Pick<Perfil, "id" | "nombre" | "color"> | null;
  /**
   * Quién lo registró. Es la firma: de esto dependen los permisos de edición
   * y borrado (migraciones 0012 y 0013). No confundir con `anticipado`.
   */
  autor: Pick<Perfil, "id" | "nombre" | "color"> | null;
};

/** Categoría con sus métricas para la pantalla de gestión. */
export type CategoriaConUso = Categoria & {
  num_movimientos: number;
  total_eur: number;
};

/** Fila que se envía al insertar o actualizar un movimiento. */
export type FilaInsertMovimiento = Tablas["movimientos"]["Insert"];
