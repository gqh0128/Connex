import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-input bg-background/60 py-1 shadow-xs outline-none transition-colors placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      density: {
        default: "h-9 px-3 text-sm",
        compact: "h-8 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      density: "default",
    },
  },
);

type InputProps = ComponentProps<"input"> & VariantProps<typeof inputVariants>;

function Input({ className, type, density, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-density={density}
      className={cn(inputVariants({ density }), className)}
      {...props}
    />
  );
}

export { Input };
