import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard Socios",
    template: "%s · Dashboard Socios",
  },
  description:
    "Dashboard financiero interno de la tienda: ingresos, gastos, KPIs y liquidación entre socios.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0B0C",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La clase `dark` es fija: esta aplicación no tiene tema claro.
  return (
    <html lang="es" className={`dark ${inter.variable}`} suppressHydrationWarning>
      {/* suppressHydrationWarning: algunas extensiones del navegador (ColorZilla,
          gestores de contraseñas…) inyectan atributos en <body> antes de que React
          hidrate y provocan un falso aviso de desajuste. */}
      <body
        className="min-h-dvh bg-base text-text-primary antialiased"
        suppressHydrationWarning
      >
        {/* Radix exige un proveedor en el árbol para que los tooltips funcionen. */}
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
