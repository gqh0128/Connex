import { Settings } from "lucide-react";

import { ConnexMark } from "@/components/brand/ConnexMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TransferPopover } from "@/features/transfers/components/TransferPopover";
import type { AppView } from "@/types/navigation";

type AppTitleBarProps = {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
};

function isMacOS() {
  return /Macintosh|Mac OS X/.test(window.navigator.userAgent);
}

export function AppTitleBar({ activeView, onViewChange }: AppTitleBarProps) {
  const isMacPlatform = isMacOS();
  const isSettingsOpen = activeView === "settings";
  const activeLabel = isSettingsOpen ? "设置" : "欢迎";

  return (
    <header
      data-tauri-drag-region={isMacPlatform ? true : undefined}
      className="flex h-11 shrink-0 select-none items-center border-b bg-surface text-surface-foreground"
    >
      {isMacPlatform ? <div className="w-[76px] shrink-0" aria-hidden="true" /> : null}

      <div
        data-tauri-drag-region={isMacPlatform ? true : undefined}
        className="pointer-events-none flex h-full min-w-0 items-center gap-2.5"
      >
        <ConnexMark size="compact" />
        <span className="text-sm font-semibold tracking-tight">Connex</span>
        <span className="px-1 text-muted-foreground/60">/</span>
        <span className="max-w-64 truncate text-xs text-muted-foreground">
          {activeLabel}
        </span>
      </div>

      <div
        data-tauri-drag-region={isMacPlatform ? true : undefined}
        className="h-full min-w-8 flex-1"
      />

      <div className="flex h-full shrink-0 items-center gap-1 px-2">
        <TransferPopover />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isSettingsOpen ? "secondary" : "ghost"}
              size="icon"
              aria-label={isSettingsOpen ? "返回工作区" : "打开设置"}
              aria-pressed={isSettingsOpen}
              onClick={() => onViewChange(isSettingsOpen ? "workspace" : "settings")}
            >
              <Settings data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isSettingsOpen ? "返回工作区" : "设置"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
