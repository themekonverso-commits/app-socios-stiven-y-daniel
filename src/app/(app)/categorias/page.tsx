import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { GestorCategorias } from "@/components/categorias/gestor-categorias";
import { obtenerCategoriasConUso } from "@/lib/consultas";

export const metadata = { title: "Categorías" };

export default async function PaginaCategorias() {
  const categorias = await obtenerCategoriasConUso();

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Categorías"
        descripcion="Aquí se limpian las categorías que se crearon sobre la marcha desde el formulario."
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <GestorCategorias
          tipo="gasto"
          titulo="Categorías de gasto"
          categorias={categorias.filter((c) => c.tipo === "gasto")}
        />
        <GestorCategorias
          tipo="ingreso"
          titulo="Categorías de ingreso"
          categorias={categorias.filter((c) => c.tipo === "ingreso")}
        />
      </div>
    </div>
  );
}
