"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renderizado de markdown SEGURO.
 *
 * `react-markdown` construye elementos de React a partir del texto: nunca pasa
 * por `dangerouslySetInnerHTML`, así que el HTML incrustado en la nota no se
 * ejecuta. Es la razón de elegirlo frente a un `marked` + sanitizador: aquí no
 * hay nada que sanear porque nunca se produce HTML crudo.
 *
 * Los enlaces se abren en pestaña nueva con rel="noopener noreferrer": sin
 * `noopener`, la página destino podría manipular la nuestra.
 */
export function Markdown({
  contenido,
  className,
  alMarcarTarea,
}: {
  contenido: string;
  className?: string;
  /**
   * Se llama al pulsar una casilla `- [ ]` de la vista previa, con el índice de
   * la casilla contando desde el principio del documento.
   */
  alMarcarTarea?: (indice: number, marcada: boolean) => void;
}) {
  // Contador de casillas para poder identificar cuál se ha pulsado.
  let indiceTarea = -1;

  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-text-secondary",
        "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-text-primary",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text-primary",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary",
        "[&_p]:my-2",
        "[&_strong]:font-semibold [&_strong]:text-text-primary",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-1",
        "[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-brand-hover",
        "[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-base [&_pre]:p-3",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-muted",
        "[&_hr]:my-4 [&_hr]:border-border",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          input: ({ checked, type }) => {
            if (type !== "checkbox") return null;
            indiceTarea += 1;
            const indice = indiceTarea;

            return (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                disabled={!alMarcarTarea}
                onChange={(evento) => alMarcarTarea?.(indice, evento.target.checked)}
                aria-label={`Tarea ${indice + 1}`}
                className="mr-1.5 size-4 translate-y-0.5 accent-[var(--accent)] disabled:opacity-60"
              />
            );
          },
          li: ({ children, className: clase }) => (
            <li className={cn(clase?.includes("task-list-item") && "list-none")}>
              {children}
            </li>
          ),
        }}
      >
        {contenido}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Marca o desmarca la casilla número `indice` en el texto markdown.
 * Se trabaja sobre el texto original para no perder nada del formato.
 */
export function alternarTareaEnMarkdown(
  markdown: string,
  indice: number,
  marcada: boolean,
): string {
  let contador = -1;

  return markdown
    .split("\n")
    .map((linea) => {
      const coincidencia = linea.match(/^(\s*[-*+]\s+)\[([ xX])\](\s.*)$/);
      if (!coincidencia) return linea;

      contador += 1;
      if (contador !== indice) return linea;

      return `${coincidencia[1]}[${marcada ? "x" : " "}]${coincidencia[3]}`;
    })
    .join("\n");
}
