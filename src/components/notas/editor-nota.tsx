"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Bold,
  Check,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  LoaderCircle,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Markdown, alternarTareaEnMarkdown } from "@/components/notas/markdown";
import { eliminarNota, guardarNota } from "@/app/acciones/notas";
import { cn } from "@/lib/utils";
import { COLORES_NOTA, type NotaConAutor } from "@/lib/tipos-cuentas";

type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "guardado" | "error";

/** Milisegundos de espera antes de guardar. */
const ESPERA_AUTOGUARDADO = 1500;

export function EditorNota({
  nota,
  etiquetasExistentes,
  alCerrar,
}: {
  nota: NotaConAutor;
  etiquetasExistentes: string[];
  alCerrar: () => void;
}) {
  const router = useRouter();

  const [titulo, setTitulo] = useState(nota.titulo ?? "");
  const [contenido, setContenido] = useState(nota.contenido ?? "");
  const [etiquetas, setEtiquetas] = useState<string[]>(nota.etiquetas ?? []);
  const [color, setColor] = useState<string | null>(nota.color ?? null);
  const [fijada, setFijada] = useState(Boolean(nota.fijada));
  const [archivada, setArchivada] = useState(Boolean(nota.archivada));

  const [pestana, setPestana] = useState<"escribir" | "vista">("escribir");
  const [estado, setEstado] = useState<EstadoGuardado>("limpio");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const temporizador = useRef<number | null>(null);
  // Cancela la respuesta de un guardado anterior que llegue tarde: sin esto,
  // una petición lenta podría pisar el estado de otra más reciente.
  const peticion = useRef(0);

  const guardar = useCallback(
    async (silencioso = true) => {
      const miPeticion = ++peticion.current;
      setEstado("guardando");

      const resultado = await guardarNota(nota.id, {
        titulo,
        contenido,
        etiquetas,
        color,
        fijada,
        archivada,
      });

      // Ya salió otro guardado después: esta respuesta no manda.
      if (miPeticion !== peticion.current) return;

      if (!resultado.ok) {
        setEstado("error");
        toast.error(resultado.error);
        return;
      }

      setEstado("guardado");
      if (!silencioso) toast.success("Nota guardada.");
      router.refresh();
    },
    [nota.id, titulo, contenido, etiquetas, color, fijada, archivada, router],
  );

  /**
   * Autoguardado con debounce real: mientras se sigue escribiendo se reinicia
   * el temporizador, así que un párrafo entero produce UNA escritura, no una
   * por tecla.
   */
  const programarGuardado = useCallback(() => {
    setEstado("pendiente");
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      void guardar(true);
    }, ESPERA_AUTOGUARDADO);
  }, [guardar]);

  useEffect(() => {
    return () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    };
  }, []);

  // Ctrl/Cmd+S fuerza el guardado; Escape cierra.
  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "s") {
        evento.preventDefault();
        if (temporizador.current) window.clearTimeout(temporizador.current);
        void guardar(false);
      }
      if (evento.key === "Escape") {
        evento.preventDefault();
        intentarCerrar();
      }
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  });

  function intentarCerrar() {
    if (estado === "pendiente" || estado === "guardando") {
      setConfirmarCierre(true);
      return;
    }
    alCerrar();
  }

  /** Inserta marcado alrededor de la selección del textarea. */
  function envolver(antes: string, despues = "", plantilla?: string) {
    const area = areaRef.current;
    if (!area) return;

    const inicio = area.selectionStart;
    const fin = area.selectionEnd;
    const seleccionado = contenido.slice(inicio, fin);
    const cuerpo = seleccionado || plantilla || "";

    const nuevo =
      contenido.slice(0, inicio) + antes + cuerpo + despues + contenido.slice(fin);

    setContenido(nuevo);
    programarGuardado();

    requestAnimationFrame(() => {
      area.focus();
      const posicion = inicio + antes.length + cuerpo.length;
      area.setSelectionRange(posicion, posicion);
    });
  }

  function anadirEtiqueta(bruta: string) {
    const etiqueta = bruta.trim();
    if (!etiqueta) return;
    if (etiquetas.some((e) => e.toLowerCase() === etiqueta.toLowerCase())) {
      setNuevaEtiqueta("");
      return;
    }
    setEtiquetas([...etiquetas, etiqueta]);
    setNuevaEtiqueta("");
    programarGuardado();
  }

  function borrar() {
    setConfirmarBorrado(false);
    void (async () => {
      const resultado = await eliminarNota(nota.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Nota eliminada.");
      alCerrar();
      router.refresh();
    })();
  }

  const sugerencias = etiquetasExistentes.filter(
    (e) => !etiquetas.some((x) => x.toLowerCase() === e.toLowerCase()),
  );

  const HERRAMIENTAS = [
    { Icono: Bold, etiqueta: "Negrita", accion: () => envolver("**", "**", "texto") },
    { Icono: Italic, etiqueta: "Cursiva", accion: () => envolver("_", "_", "texto") },
    { Icono: Heading2, etiqueta: "Título", accion: () => envolver("\n## ", "", "Título") },
    { Icono: List, etiqueta: "Lista", accion: () => envolver("\n- ", "", "elemento") },
    { Icono: ListChecks, etiqueta: "Lista de tareas", accion: () => envolver("\n- [ ] ", "", "tarea") },
    { Icono: Link2, etiqueta: "Enlace", accion: () => envolver("[", "](https://)", "texto") },
    { Icono: Code, etiqueta: "Código", accion: () => envolver("`", "`", "código") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-base">
      {/* Cabecera */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={intentarCerrar}
          aria-label="Cerrar el editor"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        {/* Indicador de guardado, discreto pero siempre visible. */}
        <p
          aria-live="polite"
          className="flex min-w-[104px] items-center gap-1.5 text-xs text-text-muted"
        >
          {estado === "guardando" ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
              Guardando…
            </>
          ) : estado === "guardado" ? (
            <>
              <Check aria-hidden="true" className="size-3 text-success" />
              Guardado
            </>
          ) : estado === "pendiente" ? (
            "Sin guardar…"
          ) : estado === "error" ? (
            <span className="text-danger">No se pudo guardar</span>
          ) : null}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setFijada(!fijada);
              programarGuardado();
            }}
            aria-pressed={fijada}
            aria-label={fijada ? "Quitar de fijadas" : "Fijar arriba"}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg transition-colors",
              fijada
                ? "bg-brand-soft text-brand"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            )}
          >
            <Pin aria-hidden="true" className={cn("size-4", fijada && "fill-current")} />
          </button>

          <button
            type="button"
            onClick={() => {
              setArchivada(!archivada);
              programarGuardado();
            }}
            aria-pressed={archivada}
            aria-label={archivada ? "Desarchivar" : "Archivar"}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg transition-colors",
              archivada
                ? "bg-surface-2 text-text-primary"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            )}
          >
            <Archive aria-hidden="true" className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            aria-label="Eliminar la nota"
            className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        <label htmlFor="nota-titulo" className="sr-only">Título</label>
        <input
          id="nota-titulo"
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value);
            programarGuardado();
          }}
          placeholder="Sin título"
          className="w-full border-0 bg-transparent text-2xl font-semibold text-text-primary outline-none placeholder:text-text-muted"
        />

        {/* Etiquetas */}
        <div className="flex flex-wrap items-center gap-2">
          {etiquetas.map((etiqueta) => (
            <span
              key={etiqueta}
              className="flex items-center gap-1 rounded-md bg-surface-2 py-1 pr-1 pl-2 text-xs text-text-secondary"
            >
              {etiqueta}
              <button
                type="button"
                onClick={() => {
                  setEtiquetas(etiquetas.filter((e) => e !== etiqueta));
                  programarGuardado();
                }}
                aria-label={`Quitar la etiqueta ${etiqueta}`}
                className="flex size-5 items-center justify-center rounded text-text-muted transition-colors hover:text-danger"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}

          <input
            list="etiquetas-existentes"
            value={nuevaEtiqueta}
            onChange={(e) => setNuevaEtiqueta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                anadirEtiqueta(nuevaEtiqueta);
              }
            }}
            onBlur={() => anadirEtiqueta(nuevaEtiqueta)}
            placeholder="+ etiqueta"
            aria-label="Añadir una etiqueta"
            className="h-8 w-28 rounded-md border border-dashed border-border bg-transparent px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
          />
          <datalist id="etiquetas-existentes">
            {sugerencias.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>

        {/* Color */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Color</span>
          {COLORES_NOTA.map((opcion) => (
            <button
              key={opcion.nombre}
              type="button"
              onClick={() => {
                setColor(opcion.valor);
                programarGuardado();
              }}
              aria-label={opcion.nombre}
              aria-pressed={color === opcion.valor}
              style={opcion.valor ? { backgroundColor: opcion.valor } : undefined}
              className={cn(
                "size-6 rounded-full border transition-transform",
                color === opcion.valor
                  ? "border-text-primary ring-2 ring-brand ring-offset-2 ring-offset-[var(--bg-base)]"
                  : "border-border",
                !opcion.valor && "bg-surface-2",
              )}
            />
          ))}
        </div>

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {HERRAMIENTAS.map(({ Icono, etiqueta, accion }) => (
            <button
              key={etiqueta}
              type="button"
              onClick={accion}
              title={etiqueta}
              aria-label={etiqueta}
              disabled={pestana === "vista"}
              className="flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40"
            >
              <Icono aria-hidden="true" className="size-4" />
            </button>
          ))}

          <div className="ml-auto flex gap-1">
            {(["escribir", "vista"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPestana(p)}
                aria-pressed={pestana === p}
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs font-medium transition-colors",
                  pestana === p
                    ? "bg-brand text-white"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                )}
              >
                {p === "escribir" ? "Escribir" : "Vista previa"}
              </button>
            ))}
          </div>
        </div>

        {pestana === "escribir" ? (
          <>
            <label htmlFor="nota-contenido" className="sr-only">Contenido</label>
            <textarea
              id="nota-contenido"
              ref={areaRef}
              value={contenido}
              onChange={(e) => {
                setContenido(e.target.value);
                programarGuardado();
              }}
              placeholder="Escribe aquí. Admite markdown: **negrita**, listas, y `- [ ]` para tareas."
              className="min-h-[50dvh] w-full flex-1 resize-none rounded-lg border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand"
            />
          </>
        ) : (
          <div className="min-h-[50dvh] flex-1 rounded-lg border border-border bg-surface p-4">
            {contenido.trim() ? (
              <Markdown
                contenido={contenido}
                alMarcarTarea={(indice, marcada) => {
                  setContenido(alternarTareaEnMarkdown(contenido, indice, marcada));
                  programarGuardado();
                }}
              />
            ) : (
              <p className="text-sm text-text-muted">
                La nota está vacía. Escribe algo en la pestaña «Escribir».
              </p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              ¿Eliminar «{titulo.trim() || "Sin título"}»?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={borrar}
              className="min-h-11 bg-danger text-white hover:bg-danger/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              Hay cambios sin guardar
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              El guardado automático todavía no ha terminado. Puedes guardarlos
              ahora o salir y perderlos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Seguir aquí</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (temporizador.current) window.clearTimeout(temporizador.current);
                await guardar(false);
                setConfirmarCierre(false);
                alCerrar();
              }}
              className="min-h-11 bg-brand text-white hover:bg-brand-hover"
            >
              Guardar y salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
