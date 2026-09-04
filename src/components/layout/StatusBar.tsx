import { LoaderCircle, LockKeyhole } from "lucide-react";

import { getSessionPresentation } from "@/features/terminal/sessionPresentation";
import type { SessionTone } from "@/features/terminal/sessionPresentation";
import type { SshSessionTab } from "@/features/terminal/sessionTypes";
import { cn } from "@/lib/utils";

type StatusBarProps = {
  activeTab: SshSessionTab | null;
  appVersion: string | null;
};

export function StatusBar({ activeTab, appVersion }: StatusBarProps) {
  const presentation = getSessionPresentation(activeTab);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        {presentation.isBusy ? (
          <LoaderCircle className="size-3 animate-spin text-info" />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full",
              STATUS_TONE_CLASS[presentation.tone],
            )}
          />
        )}
        <span>{presentation.label}</span>
        {presentation.detail ? (
          <span className="max-w-96 truncate text-muted-foreground/70">
            · {presentation.detail}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <LockKeyhole className="size-3" />
          本地安全存储
        </span>
        <span className="w-[4.75rem] text-right tabular-nums">
          {appVersion ? `Connex ${appVersion}` : "Connex"}
        </span>
      </div>
    </footer>
  );
}

const STATUS_TONE_CLASS: Record<SessionTone, string> = {
  muted: "bg-muted-foreground/50",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  error: "bg-destructive",
};
