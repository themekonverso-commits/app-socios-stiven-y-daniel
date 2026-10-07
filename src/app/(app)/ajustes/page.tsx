import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { FormularioAjustes } from "@/components/ajustes/formulario-ajustes";
import { obtenerAjustes, obtenerTesoreria } from "@/lib/consultas-kpi";

export const metadata = { title: "Ajustes" };

export default async function PaginaAjustes() {
  const [{ saldoInicial, saldoInicialPaypal, objetivos }, tesoreria] = await Promise.all([
    obtenerAjustes(),
    obtenerTesoreria(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EncabezadoPagina
        titulo="Ajustes"
        descripcion="Saldos de partida del banco y de PayPal, y objetivos del mes."
      />

      <FormularioAjustes
        saldoInicial={saldoInicial}
        saldoInicialPaypal={saldoInicialPaypal}
        objetivos={objetivos}
        saldoActual={tesoreria.saldoBanco}
        saldoPaypalActual={tesoreria.saldoPaypal}
      />
    </div>
  );
}
