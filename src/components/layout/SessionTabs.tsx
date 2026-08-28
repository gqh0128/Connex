import { Files, LoaderCircle, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSessionPresentation } from "@/features/terminal/sessionPresentation";
import type { SessionTone } from "@/features/terminal/sessionPresentation";
import type { SshSessionTab } from "@/features/terminal/sessionTypes";
import { cn } from "@/lib/utils";

import { SidebarToggleButton } from "./SidebarToggleButton";

type SessionTabsProps = {
  tabs: SshSessionTab[];
  activeTabId: string | null;
  isSidebarCollapsed: boolean;
  isFilePanelOpen: boolean;
  onSelect: (localId: string) => void;
  onClose: (localId: string) => void;
  onSidebarToggle: () => void;
  onNewConnection: () => void;
  onFilePanelToggle: () => void;
};

export function SessionTabs({
  tabs,
  activeTabId,
  isSidebarCollapsed,
  isFilePanelOpen,
  onSelect,
  onClose,
  onSidebarToggle,
  onNewConnection,
  onFilePanelToggle,
}: SessionTabsProps) {
  return (
    <header className="flex h-11 shrink-0 items-stretch border-b bg-surface">
      <div className="flex shrink-0 items-center gap-0.5 px-1">
        <SidebarToggleButton
          isCollapsed={isSidebarCollapsed}
          onToggle={onSidebarToggle}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="新建连接标签页"
              onClick={onNewConnection}
            >
              <Plus data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建连接</TooltipContent>
        </Tooltip>
      </div>
      <Separator orientation="vertical" />

      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.localId === activeTabId;
          const presentation = getSessionPresentation(tab);

          return (
            <div
              key={tab.localId}
              className={cn(
                "group relative flex w-48 shrink-0 items-stretch border-r",
                isActive ? "bg-workspace" : "bg-surface hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`terminal-${tab.localId}`}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 pr-9 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onSelect(tab.localId)}
              >
                <SessionStatusIndicator
                  tone={presentation.tone}
                  isBusy={presentation.isBusy}
                  label={presentation.label}
                />
                <span className="truncate">{tab.profile.name}</span>
              </button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`关闭 ${tab.profile.name} 标签页`}
                    className={cn(
                      "absolute top-2 right-1.5",
                      isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    )}
                    onClick={() => onClose(tab.localId)}
                  >
                    <X data-icon="inline-start" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>关闭标签页</TooltipContent>
              </Tooltip>

              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center border-l px-1.5">
        <Button
          type="button"
          variant={isFilePanelOpen ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={isFilePanelOpen}
          onClick={onFilePanelToggle}
        >
          <Files data-icon="inline-start" />
          文件
        </Button>
      </div>
    </header>
  );
}

const STATUS_TONE_CLASS: Record<SessionTone, string> = {
  muted: "bg-muted-foreground/60",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  error: "bg-destructive",
};

type SessionStatusIndicatorProps = {
  tone: SessionTone;
  isBusy: boolean;
  label: string;
};

function SessionStatusIndicator({ tone, isBusy, label }: SessionStatusIndicatorProps) {
  if (isBusy) {
    return (
      <LoaderCircle
        aria-label={label}
        className="size-3 shrink-0 animate-spin text-info"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("size-1.5 shrink-0 rounded-full", STATUS_TONE_CLASS[tone])}
    />
  );
}
