"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";

import { iniciarSesion } from "@/app/acciones-auth";
import { esquemaLogin, type DatosLogin } from "@/app/login/esquema";

export function FormularioLogin() {
  const parametros = useSearchParams();
  const redirigir = parametros.get("redirigir") ?? undefined;

  const [pendiente, iniciarTransicion] = useTransition();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [verContrasena, setVerContrasena] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: "", password: "" },
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    iniciarTransicion(async () => {
      const resultado = await iniciarSesion({ ...valores, redirigir });
      if (resultado?.error) {
        setErrorServidor(resultado.error);
      }
    });
  });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {errorServidor ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{errorServidor}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-text-primary"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          disabled={pendiente}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "error-email" : undefined}
          placeholder="socio@tutienda.com"
          className="h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand disabled:opacity-60 aria-invalid:border-danger"
          {...register("email")}
        />
        {errors.email ? (
          <p id="error-email" role="alert" className="text-sm text-danger">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-text-primary"
        >
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            type={verContrasena ? "text" : "password"}
            autoComplete="current-password"
            disabled={pendiente}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "error-password" : undefined}
            placeholder="••••••••"
            className="h-11 w-full rounded-lg border border-border bg-surface-2 pr-12 pl-3 text-base text-text-primary transition-colors outline-none placeholder:text-text-muted focus-visible:border-brand disabled:opacity-60 aria-invalid:border-danger"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setVerContrasena((valor) => !valor)}
            aria-label={
              verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary"
          >
            {verContrasena ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {errors.password ? (
          <p id="error-password" role="alert" className="text-sm text-danger">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-60"
      >
        {pendiente ? (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
            />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </button>
    </form>
  );
}
