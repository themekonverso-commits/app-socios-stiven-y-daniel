"use client";

import { useState } from "react";

import { SelectorSegmentado } from "@/components/campos/selector-segmentado";
import { FormularioCobro } from "@/components/cobros/formulario-cobro";
import { FormularioTraspaso } from "@/components/cobros/formulario-traspaso";

type Que = "cobro" | "traspaso";

/** Un solo bloque para las dos altas de /cobros: un cobro o un traspaso. */
export function PanelRegistro() {
  const [que, setQue] = useState<Que>("cobro");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          {que === "cobro" ? "Registrar un cobro" : "Traspaso PayPal → Banco"}
        </h2>
        <SelectorSegmentado
          nombre="registro-cobros"
          etiquetaGrupo="Qué quieres registrar"
          valor={que}
          opciones={[
            { valor: "cobro", etiqueta: "Cobro" },
            { valor: "traspaso", etiqueta: "Traspaso PayPal → Banco" },
          ]}
          alCambiar={setQue}
          className="sm:w-96"
        />
      </div>
      <div className="mt-3">
        {que === "cobro" ? <FormularioCobro /> : <FormularioTraspaso />}
      </div>
    </section>
  );
}
