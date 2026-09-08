import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  conTexto = true,
}: {
  className?: string;
  conTexto?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white"
      >
        <Zap className="size-4.5 fill-current" />
      </span>
      {conTexto ? (
        <span className="text-base font-semibold tracking-tight text-text-primary">
          Socios
        </span>
      ) : null}
    </span>
  );
}
