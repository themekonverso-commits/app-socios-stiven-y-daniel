import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Este proyecto vive dentro de un workspace con otros package-lock.json por
   * encima. Sin esto, Next infiere mal la raíz y avisa en cada build.
   */
  outputFileTracingRoot: path.join(__dirname),

  typescript: {
    // Nunca desplegar con errores de tipos. Explícito para que nadie lo relaje.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
