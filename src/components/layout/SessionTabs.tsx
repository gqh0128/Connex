import {
  CircleX,
  Files,
  LoaderCircle,
  PanelRightClose,
  Plus,
  RefreshCw,
  Settings2,
  SquareTerminal,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  onReconnect: (localId: string) => void;
  onCloseOther: (localId: string) => void;
  onCloseRight: (localId: string) => void;
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
  onReconnect,
  onCloseOther,
  onCloseRight,
  onPageSelect,
  onPageClose,
  onSidebarToggle,
  onNewConnection,
  onFilePanelToggle,
}: SessionTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tabList = tabListRef.current;
    const activeTab = tabList?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!tabList || !activeTab) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const listBounds = tabList.getBoundingClientRect();
      const tabBounds = activeTab.getBoundingClientRect();
      let nextScrollLeft: number | null = null;

      if (tabBounds.left < listBounds.left) {
        nextScrollLeft = tabList.scrollLeft + tabBounds.left - listBounds.left;
      } else if (tabBounds.right > listBounds.right) {
        nextScrollLeft = tabList.scrollLeft + tabBounds.right - listBounds.right;
      }

      if (nextScrollLeft !== null) {
        tabList.scrollTo({
          left: nextScrollLeft,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [activePageId, activeTabId]);

  return (
    <header
      className="flex h-8 shrink-0 items-stretch border-b bg-surface"
      onContextMenu={(event) => event.preventDefault()}
    >
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

      <div
        ref={tabListRef}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tabs.map((tab, tabIndex) => {
          const isActive = tab.localId === activeTabId;
          const presentation = getSessionPresentation(tab);

          return (
            <ContextMenu key={tab.localId}>
              <ContextMenuTrigger asChild>
                <div
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
                    <span className="flex min-w-0 items-center gap-1">
                      <SquareTerminal
                        aria-hidden="true"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate">{tab.profile.name}</span>
                    </span>
                  </button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`关闭 ${tab.profile.name} 标签页`}
                        className={cn(
                          "absolute top-0.5 right-1",
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
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuGroup>
                  <ContextMenuItem
                    disabled={presentation.isBusy}
                    onSelect={() => onReconnect(tab.localId)}
                  >
                    <RefreshCw />
                    重新连接
                  </ContextMenuItem>
                </ContextMenuGroup>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => onClose(tab.localId)}>
                    <X />
                    关闭标签页
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={tabs.length <= 1}
                    onSelect={() => onCloseOther(tab.localId)}
                  >
                    <CircleX />
                    关闭其他会话
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={tabIndex === tabs.length - 1}
                    onSelect={() => onCloseRight(tab.localId)}
                  >
                    <PanelRightClose />
                    关闭右侧会话
                  </ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {pageTabs.map((tab) => {
          const isActive = tab.id === activePageId;
          const PageIcon = WORKSPACE_PAGE_ICONS[tab.id];

          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
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
                          "absolute top-0.5 right-1",
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
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => onPageClose(tab.id)}>
                    <X />
                    关闭标签页
                  </ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuContent>
            </ContextMenu>
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
