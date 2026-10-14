import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { FormularioAjustes } from "@/components/ajustes/formulario-ajustes";
import { obtenerAjustes, obtenerTesoreria } from "@/lib/consultas-kpi";
import { obtenerCupoTarjeta } from "@/lib/consultas-cupo";

export const metadata = { title: "Ajustes" };

export default async function PaginaAjustes() {
  const [{ saldoInicial, saldoInicialPaypal }, tesoreria, cupo] = await Promise.all([
    obtenerAjustes(),
    obtenerTesoreria(),
    obtenerCupoTarjeta(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EncabezadoPagina
        alcance="global"
        titulo="Ajustes"
        descripcion="Lo que es de la sociedad y vale para todas las tiendas: saldos de partida del banco y de PayPal."
      />

      <FormularioAjustes
        saldoInicial={saldoInicial}
        saldoInicialPaypal={saldoInicialPaypal}
        saldoActual={tesoreria.saldoBanco}
        saldoPaypalActual={tesoreria.saldoPaypal}
        cupo={cupo}
      />
    </div>
  );
}
