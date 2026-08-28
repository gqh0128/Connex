import { Files, LoaderCircle, Plus, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSessionPresentation } from "@/features/terminal/sessionPresentation";
import type { SessionTone } from "@/features/terminal/sessionPresentation";
import type { SshSessionTab } from "@/features/terminal/sessionTypes";
import { cn } from "@/lib/utils";
import type { WorkspacePageId, WorkspacePageTab } from "@/types/navigation";

import { SidebarToggleButton } from "./SidebarToggleButton";

const WORKSPACE_PAGE_ICONS: Record<WorkspacePageId, typeof Settings2> = {
  settings: Settings2,
};

type SessionTabsProps = {
  tabs: SshSessionTab[];
  activeTabId: string | null;
  pageTabs: WorkspacePageTab[];
  activePageId: WorkspacePageId | null;
  isSidebarCollapsed: boolean;
  isFilePanelOpen: boolean;
  isFilePanelEnabled: boolean;
  onSelect: (localId: string) => void;
  onClose: (localId: string) => void;
  onPageSelect: (pageId: WorkspacePageId) => void;
  onPageClose: (pageId: WorkspacePageId) => void;
  onSidebarToggle: () => void;
  onNewConnection: () => void;
  onFilePanelToggle: () => void;
};

export function SessionTabs({
  tabs,
  activeTabId,
  pageTabs,
  activePageId,
  isSidebarCollapsed,
  isFilePanelOpen,
  isFilePanelEnabled,
  onSelect,
  onClose,
  onPageSelect,
  onPageClose,
  onSidebarToggle,
  onNewConnection,
  onFilePanelToggle,
}: SessionTabsProps) {
  return (
    <header className="flex h-9 shrink-0 items-stretch border-b bg-surface">
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
                "group relative flex w-40 shrink-0 items-stretch border-r",
                isActive ? "bg-workspace" : "bg-surface hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`terminal-${tab.localId}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                      "absolute top-1 right-1",
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

        {pageTabs.map((tab) => {
          const isActive = tab.id === activePageId;
          const PageIcon = WORKSPACE_PAGE_ICONS[tab.id];

          return (
            <div
              key={tab.id}
              className={cn(
                "group relative flex w-40 shrink-0 items-stretch border-r",
                isActive ? "bg-workspace" : "bg-surface hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={tab.controlsId}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onPageSelect(tab.id)}
              >
                <PageIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{tab.label}</span>
              </button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`关闭 ${tab.label} 标签页`}
                    className={cn(
                      "absolute top-1 right-1",
                      isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    )}
                    onClick={() => onPageClose(tab.id)}
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

      <div className="flex items-center border-l px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isFilePanelOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={isFilePanelOpen ? "关闭远程文件面板" : "打开远程文件面板"}
              aria-pressed={isFilePanelOpen}
              disabled={!isFilePanelEnabled}
              onClick={onFilePanelToggle}
            >
              <Files data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isFilePanelOpen ? "关闭远程文件" : "打开远程文件"}
          </TooltipContent>
        </Tooltip>
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
