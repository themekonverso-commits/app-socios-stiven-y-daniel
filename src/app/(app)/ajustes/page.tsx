import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { FormularioAjustes } from "@/components/ajustes/formulario-ajustes";
import { obtenerAjustes, obtenerSaldoCaja } from "@/lib/consultas-kpi";

export const metadata = { title: "Ajustes" };

export default async function PaginaAjustes() {
  const [{ saldoInicial, objetivos }, saldo] = await Promise.all([
    obtenerAjustes(),
    obtenerSaldoCaja(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EncabezadoPagina
        titulo="Ajustes"
        descripcion="Saldo de partida y objetivos del mes."
      />

      <FormularioAjustes
        saldoInicial={saldoInicial}
        objetivos={objetivos}
        saldoActual={saldo.saldoBanco}
      />
    </div>
  );
}
