import { Suspense } from "react";

import { Logo } from "@/components/layout/logo";
import { FormularioLogin } from "@/app/login/formulario-login";

export const metadata = {
  title: "Entrar",
  description: "Acceso al dashboard financiero.",
};

export default function PaginaLogin() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-base p-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex justify-center">
            <Logo />
          </div>

          <h1 className="mt-6 text-center text-xl font-semibold tracking-tight text-text-primary">
            Entrar al dashboard
          </h1>
          <p className="mt-1 mb-6 text-center text-sm text-text-secondary">
            Acceso reservado a los dos socios.
          </p>

          {/* useSearchParams obliga a envolver el formulario en Suspense. */}
          <Suspense
            fallback={<div className="h-[268px]" aria-hidden="true" />}
          >
            <FormularioLogin />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-text-muted">
          Las cuentas se crean a mano desde el panel de Supabase. Aquí no hay
          registro público.
        </p>
      </div>
    </main>
  );
}
