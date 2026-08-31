import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TransferPopover } from "@/features/transfers/components/TransferPopover";
import type { FileTransfersController } from "@/features/transfers/hooks/useFileTransfers";
import { isMacOSPlatform } from "@/lib/platform";
import type { AppView, WorkspacePageId } from "@/types/navigation";

type AppTitleBarProps = {
  activeView: AppView;
  activeContextLabel: string | null;
  transfers: FileTransfersController;
  onPageOpen: (pageId: WorkspacePageId) => void;
};

export function AppTitleBar({
  activeView,
  activeContextLabel,
  transfers,
  onPageOpen,
}: AppTitleBarProps) {
  const isMacPlatform = isMacOSPlatform();
  const isSettingsOpen = activeView === "settings";
  const activeLabel = isSettingsOpen ? "设置" : (activeContextLabel ?? "欢迎");

  return (
    <header
      data-tauri-drag-region={isMacPlatform ? true : undefined}
      className="flex h-11 shrink-0 select-none items-center border-b bg-surface text-surface-foreground"
      onContextMenu={(event) => event.preventDefault()}
    >
      {isMacPlatform ? <div className="w-[76px] shrink-0" aria-hidden="true" /> : null}

      <div
        data-tauri-drag-region={isMacPlatform ? true : undefined}
        className="pointer-events-none flex h-full min-w-0 items-center gap-2"
      >
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
        <TransferPopover controller={transfers} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isSettingsOpen ? "secondary" : "ghost"}
              size="icon"
              aria-label={isSettingsOpen ? "设置标签页已打开" : "打开设置标签页"}
              aria-pressed={isSettingsOpen}
              onClick={() => onPageOpen("settings")}
            >
              <Settings data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isSettingsOpen ? "设置已打开" : "打开设置"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
