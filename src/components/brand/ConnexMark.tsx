import { Cable } from "lucide-react";

import { cn } from "@/lib/utils";

type ConnexMarkProps = {
  className?: string;
  size?: "default" | "large";
};

export function ConnexMark({ className, size = "default" }: ConnexMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid place-items-center bg-primary text-primary-foreground",
        size === "large"
          ? "size-11 rounded-xl [&_svg]:size-5"
          : "size-8 rounded-lg [&_svg]:size-4",
        className,
      )}
    >
      <Cable strokeWidth={2.2} />
    </span>
  );
}
