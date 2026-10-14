"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { crearTienda, editarTienda } from "@/app/acciones/tiendas";
import { SelectorFecha } from "@/components/campos/selector-fecha";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLORES_TIENDA, conTienda, type Tienda } from "@/lib/ambito";
import { hoyEnEspana } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * Alta y edición de una tienda. Al crearla, queda seleccionada y se abre su
 * dashboard vacío.
 */
export function DialogoTienda({
  abierto,
  alCambiarAbierto,
  tienda,
}: {
  abierto: boolean;
  alCambiarAbierto: (abierto: boolean) => void;
  /** Si viene, se edita; si no, se crea. */
  tienda?: Tienda;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogContent className="sm:max-w-md">
        {/* La key reinicia el formulario cada vez que se abre. */}
        {abierto ? (
          <Formulario
            key={tienda?.id ?? "nueva"}
            tienda={tienda}
            alTerminar={() => alCambiarAbierto(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ tienda, alTerminar }: { tienda?: Tienda; alTerminar: () => void }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(tienda?.nombre ?? "");
  const [url, setUrl] = useState(tienda?.url_shopify ?? "");
  const [color, setColor] = useState<string>(tienda?.color ?? COLORES_TIENDA[1]);
  const [fecha, setFecha] = useState(
    tienda?.fecha_lanzamiento ?? format(hoyEnEspana(), "yyyy-MM-dd"),
  );
  const [objFact, setObjFact] = useState(String(tienda?.objetivo_mes.facturacion ?? 0));
  const [objBen, setObjBen] = useState(String(tienda?.objetivo_mes.beneficio ?? 0));
  const [error, setError] = useState<string | null>(null);

  const editando = !!tienda;

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    const datos = {
      nombre,
      url_shopify: url || null,
      color,
      fecha_lanzamiento: fecha || null,
      objetivo_facturacion: Number(objFact.replace(",", ".")) || 0,
      objetivo_beneficio: Number(objBen.replace(",", ".")) || 0,
      notas: tienda?.notas ?? null,
    };

    iniciar(async () => {
      const resultado = editando
        ? await editarTienda(tienda.id, datos)
        : await crearTienda(datos);

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }

      alTerminar();
      if (editando) {
        toast.success(`«${nombre.trim()}» actualizada.`);
        router.refresh();
      } else {
        toast.success(`Tienda «${nombre.trim()}» creada.`);
        // Se selecciona y se abre su dashboard, vacío.
        router.push(conTienda("/", resultado.datos!.slug));
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{editando ? `Editar ${tienda.nombre}` : "Nueva tienda"}</DialogTitle>
        <DialogDescription>
          {editando
            ? "Los movimientos de la tienda no cambian."
            : "Empieza vacía: sus números no se mezclan con los de las demás."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tienda-nombre">Nombre</Label>
        <Input
          id="tienda-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={60}
          required
          autoFocus
          placeholder="Mi tienda"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tienda-url">URL de Shopify</Label>
        <Input
          id="tienda-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="mitienda.myshopify.com"
          inputMode="url"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap items-center gap-2">
          {COLORES_TIENDA.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color.toLowerCase() === c.toLowerCase()}
              onClick={() => setColor(c)}
              className={cn(
                "flex size-9 items-center justify-center rounded-full border-2 transition-transform",
                color.toLowerCase() === c.toLowerCase()
                  ? "scale-110 border-text-primary"
                  : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            >
              {color.toLowerCase() === c.toLowerCase() ? (
                <Check aria-hidden="true" className="size-4 text-white" />
              ) : null}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-9 cursor-pointer rounded-full border border-border bg-transparent"
              aria-label="Otro color"
            />
            <span className="cifra">{color.toUpperCase()}</span>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label>Fecha de lanzamiento</Label>
        <SelectorFecha valor={fecha} alCambiar={setFecha} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tienda-obj-fact">Objetivo facturación / mes</Label>
          <Input
            id="tienda-obj-fact"
            value={objFact}
            onChange={(e) => setObjFact(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tienda-obj-ben">Objetivo beneficio / mes</Label>
          <Input
            id="tienda-obj-ben"
            value={objBen}
            onChange={(e) => setObjBen(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={alTerminar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendiente || !nombre.trim()}>
          {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear tienda"}
        </Button>
      </DialogFooter>
    </form>
  );
}
