import { Cable } from "lucide-react";

import { cn } from "@/lib/utils";

type ConnexMarkProps = {
  className?: string;
};

export function ConnexMark({ className }: ConnexMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20",
        className,
      )}
    >
      <Cable className="size-4" strokeWidth={2.2} />
    </span>
  );
}
