import { z } from "zod";

export const esquemaLogin = z.object({
  email: z
    .string()
    .min(1, "Escribe tu email.")
    .pipe(z.email("Ese email no tiene un formato válido.")),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;
