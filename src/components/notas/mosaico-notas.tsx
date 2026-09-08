"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { NotebookPen, Pin, Search, X } from "lucide-react";
import { toast } from "sonner";

import { EditorNota } from "@/components/notas/editor-nota";
import { Markdown } from "@/components/notas/markdown";
import { EstadoVacio } from "@/components/estado-vacio";
import { alternarFijada, crearNota } from "@/app/acciones/notas";
import { cn } from "@/lib/utils";
import type { NotaConAutor } from "@/lib/tipos-cuentas";
import type { Perfil } from "@/lib/tipos-db";

function haceCuanto(fecha: string | null): string {
  if (!fecha) return "";
  try {
    return formatDistanceToNow(new Date(fecha), { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}

function TarjetaNota({
  nota,
  alAbrir,
  alFijar,
}: {
  nota: NotaConAutor;
  alAbrir: () => void;
  alFijar: () => void;
}) {
  return (
    <article
      className="mb-3 break-inside-avoid rounded-xl border border-border bg-surface transition-colors hover:bg-surface-2"
      style={
        nota.color
          ? { borderTopColor: nota.color, borderTopWidth: 3 }
          : undefined
      }
    >
      <div className="flex items-start gap-2 p-4 pb-2">
        <button
          type="button"
          onClick={alAbrir}
          className="min-w-0 flex-1 text-left"
        >
          <h3 className="truncate text-sm font-semibold text-text-primary">
            {nota.titulo?.trim() || "Sin título"}
          </h3>
        </button>

        <button
          type="button"
          onClick={alFijar}
          aria-pressed={Boolean(nota.fijada)}
          aria-label={nota.fijada ? "Quitar de fijadas" : "Fijar arriba"}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
            nota.fijada
              ? "text-brand"
              : "text-text-muted hover:bg-surface hover:text-text-secondary",
          )}
        >
          <Pin aria-hidden="true" className={cn("size-4", nota.fijada && "fill-current")} />
        </button>
      </div>

      {/* La vista previa se recorta con un degradado: da a entender que sigue. */}
      <button type="button" onClick={alAbrir} className="block w-full px-4 text-left">
        {nota.contenido?.trim() ? (
          <div className="relative max-h-[18rem] overflow-hidden">
            <Markdown contenido={nota.contenido} />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-surface to-transparent"
            />
          </div>
        ) : (
          <p className="text-sm text-text-muted">Nota vacía.</p>
        )}
      </button>

      {nota.etiquetas.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3">
          {nota.etiquetas.map((etiqueta) => (
            <li
              key={etiqueta}
              className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {etiqueta}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span
            aria-hidden="true"
            style={{ backgroundColor: nota.autor_color ?? "#6E6E73" }}
            className="size-2 shrink-0 rounded-full"
          />
          {nota.autor_nombre || "—"}
        </span>
        <time className="ml-auto text-text-muted" dateTime={nota.updated_at ?? undefined}>
          {haceCuanto(nota.updated_at)}
        </time>
      </footer>
    </article>
  );
}

export function MosaicoNotas({
  notas,
  etiquetas,
  socios,
  filtros,
}: {
  notas: NotaConAutor[];
  etiquetas: { etiqueta: string; total: number }[];
  socios: Perfil[];
  filtros: { q: string; etiquetas: string[]; autor: string; archivadas: boolean };
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<NotaConAutor | null>(null);
  const [busqueda, setBusqueda] = useState(filtros.q);
  const [, iniciarTransicion] = useTransition();

  const nombresEtiquetas = useMemo(() => etiquetas.map((e) => e.etiqueta), [etiquetas]);

  const fijadas = notas.filter((n) => n.fijada);
  const resto = notas.filter((n) => !n.fijada);

  function navegar(cambios: Partial<typeof filtros>) {
    const siguiente = { ...filtros, ...cambios };
    const params = new URLSearchParams();
    if (siguiente.q) params.set("q", siguiente.q);
    if (siguiente.etiquetas.length) params.set("etiquetas", siguiente.etiquetas.join(","));
    if (siguiente.autor !== "todos") params.set("autor", siguiente.autor);
    if (siguiente.archivadas) params.set("archivadas", "1");

    const query = params.toString();
    iniciarTransicion(() => {
      router.push(query ? `/notas?${query}` : "/notas", { scroll: false });
    });
  }

  function nueva() {
    iniciarTransicion(async () => {
      const resultado = await crearNota();
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setEditando({
        id: resultado.datos!.id,
        titulo: "",
        contenido: "",
        etiquetas: [],
        color: null,
        fijada: false,
        archivada: false,
        created_by: "",
        created_at: null,
        updated_at: null,
        autor_nombre: "",
        autor_color: null,
      } as NotaConAutor);
    });
  }

  function fijar(nota: NotaConAutor) {
    iniciarTransicion(async () => {
      const resultado = await alternarFijada(nota.id, !nota.fijada);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="buscador-notas" className="sr-only">
            Buscar en título y contenido
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            id="buscador-notas"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navegar({ q: busqueda });
            }}
            onBlur={() => {
              if (busqueda !== filtros.q) navegar({ q: busqueda });
            }}
            placeholder="Buscar en título y contenido…"
            className="h-11 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
          />
        </div>

        <select
          aria-label="Autor"
          value={filtros.autor}
          onChange={(e) => navegar({ autor: e.target.value })}
          className="h-11 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary outline-none focus-visible:border-brand"
        >
          <option value="todos">Cualquier autor</option>
          {socios.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={filtros.archivadas}
            onChange={(e) => navegar({ archivadas: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          Ver archivadas
        </label>

        <button
          type="button"
          onClick={nueva}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Nueva nota
        </button>
      </div>

      {/* Chips de etiquetas */}
      {etiquetas.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {etiquetas.map(({ etiqueta, total }) => {
            const activa = filtros.etiquetas.includes(etiqueta);
            return (
              <li key={etiqueta}>
                <button
                  type="button"
                  onClick={() =>
                    navegar({
                      etiquetas: activa
                        ? filtros.etiquetas.filter((e) => e !== etiqueta)
                        : [...filtros.etiquetas, etiqueta],
                    })
                  }
                  aria-pressed={activa}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                    activa
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  )}
                >
                  {etiqueta}
                  <span className="cifra text-text-muted">{total}</span>
                  {activa ? <X aria-hidden="true" className="size-3" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {notas.length === 0 ? (
        <EstadoVacio
          icono={NotebookPen}
          titulo={
            filtros.q || filtros.etiquetas.length > 0
              ? "Ninguna nota coincide"
              : filtros.archivadas
                ? "No hay notas archivadas"
                : "El bloc está vacío"
          }
          descripcion={
            filtros.q || filtros.etiquetas.length > 0
              ? "Prueba con otra búsqueda o quita alguna etiqueta."
              : "Aquí van los acuerdos verbales, los procedimientos, los contactos de proveedores y lo que haya que recordar en la próxima reunión trimestral. Lo que hoy está en un WhatsApp."
          }
          accion={
            !filtros.archivadas ? (
              <button
                type="button"
                onClick={nueva}
                className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Escribir la primera
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {fijadas.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-text-muted uppercase">
                <Pin aria-hidden="true" className="size-3 fill-current" />
                Fijadas
              </h2>
              {/* Mosaico con columnas CSS: cada tarjeta ocupa lo que mide. */}
              <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
                {fijadas.map((nota) => (
                  <TarjetaNota
                    key={nota.id}
                    nota={nota}
                    alAbrir={() => setEditando(nota)}
                    alFijar={() => fijar(nota)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {resto.length > 0 ? (
            <section>
              {fijadas.length > 0 ? (
                <h2 className="mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
                  Todas las demás
                </h2>
              ) : null}
              <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
                {resto.map((nota) => (
                  <TarjetaNota
                    key={nota.id}
                    nota={nota}
                    alAbrir={() => setEditando(nota)}
                    alFijar={() => fijar(nota)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {editando ? (
        <EditorNota
          nota={editando}
          etiquetasExistentes={nombresEtiquetas}
          alCerrar={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
