import {
  ArrowLeftRight,
  CalendarDays,
  ChartColumn,
  FileDown,
  LayoutDashboard,
  Scale,
  Settings,
  StickyNote,
  Tags,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type EnlaceNavegacion = {
  titulo: string;
  href: string;
  icono: LucideIcon;
  /** Fase del plan en la que se implementa. Se muestra en el marcador. */
  fase: number;
};

export type GrupoNavegacion = {
  titulo: string | null;
  enlaces: EnlaceNavegacion[];
};

export const NAVEGACION: GrupoNavegacion[] = [
  {
    titulo: "Principal",
    enlaces: [
      { titulo: "Dashboard", href: "/", icono: LayoutDashboard, fase: 2 },
      {
        titulo: "Movimientos",
        href: "/movimientos",
        icono: ArrowLeftRight,
        fase: 1,
      },
      {
        titulo: "Registro diario",
        href: "/diario",
        icono: CalendarDays,
        fase: 1,
      },
    ],
  },
  {
    titulo: "Análisis",
    enlaces: [
      { titulo: "KPIs", href: "/kpis", icono: ChartColumn, fase: 2 },
      { titulo: "Liquidación", href: "/liquidacion", icono: Scale, fase: 3 },
    ],
  },
  {
    titulo: "Gestión",
    enlaces: [
      { titulo: "Cuentas y activos", href: "/cuentas", icono: Wallet, fase: 4 },
      { titulo: "Notas", href: "/notas", icono: StickyNote, fase: 4 },
      { titulo: "Categorías", href: "/categorias", icono: Tags, fase: 1 },
      { titulo: "Importar", href: "/importar", icono: Upload, fase: 5 },
      { titulo: "Exportar", href: "/exportar", icono: FileDown, fase: 5 },
    ],
  },
  {
    titulo: null,
    enlaces: [
      { titulo: "Ajustes", href: "/ajustes", icono: Settings, fase: 5 },
    ],
  },
];

/** Los cuatro destinos de la barra inferior en móvil. */
export const NAVEGACION_MOVIL: EnlaceNavegacion[] = [
  { titulo: "Dashboard", href: "/", icono: LayoutDashboard, fase: 2 },
  { titulo: "Movimientos", href: "/movimientos", icono: ArrowLeftRight, fase: 1 },
  { titulo: "Diario", href: "/diario", icono: CalendarDays, fase: 1 },
  { titulo: "KPIs", href: "/kpis", icono: ChartColumn, fase: 2 },
];

/** Todos los enlaces en plano, útil para títulos y buscador. */
export const TODOS_LOS_ENLACES: EnlaceNavegacion[] = NAVEGACION.flatMap(
  (grupo) => grupo.enlaces,
);

/**
 * ¿Está activa esta ruta? "/" solo coincide de forma exacta; el resto también
 * con sus subrutas, para que /movimientos/123 marque Movimientos.
 */
export function esRutaActiva(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
