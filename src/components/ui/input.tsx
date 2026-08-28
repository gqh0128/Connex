import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 py-1 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
