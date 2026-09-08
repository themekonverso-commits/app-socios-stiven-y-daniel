import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { MosaicoNotas } from "@/components/notas/mosaico-notas";
import { obtenerEtiquetas, obtenerNotas } from "@/lib/consultas-cuentas";
import { obtenerSocios } from "@/lib/consultas";

export const metadata = { title: "Notas" };

type Params = Promise<Record<string, string | string[] | undefined>>;

function texto(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

export default async function PaginaNotas({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;

  const filtros = {
    q: texto(params.q).slice(0, 120),
    etiquetas: texto(params.etiquetas)
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    autor: texto(params.autor) || "todos",
    archivadas: texto(params.archivadas) === "1",
  };

  const [notas, etiquetas, socios] = await Promise.all([
    obtenerNotas(filtros),
    obtenerEtiquetas(),
    obtenerSocios(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        titulo="Notas"
        descripcion="El bloc compartido: acuerdos, procedimientos y lo que haya que recordar."
      />

      <MosaicoNotas
        notas={notas}
        etiquetas={etiquetas}
        socios={socios}
        filtros={filtros}
      />
    </div>
  );
}
