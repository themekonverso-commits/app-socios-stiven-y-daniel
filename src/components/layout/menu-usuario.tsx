"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { cerrarSesion } from "@/app/acciones-auth";

export type UsuarioSidebar = {
  nombre: string;
  email: string;
  color: string;
};

export function MenuUsuario({ usuario }: { usuario: UsuarioSidebar }) {
  const [pendiente, iniciarTransicion] = useTransition();

  const iniciales = usuario.nombre.trim().slice(0, 2).toUpperCase() || "??";

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5">
      <span
        aria-hidden="true"
        style={{ backgroundColor: usuario.color }}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
      >
        {iniciales}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {usuario.nombre}
        </p>
        <p className="truncate text-xs text-text-secondary">{usuario.email}</p>
      </div>

      <button
        type="button"
        onClick={() => iniciarTransicion(() => cerrarSesion())}
        disabled={pendiente}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
      >
        <LogOut aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
