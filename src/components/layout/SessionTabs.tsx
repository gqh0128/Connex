import { Files, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SessionTabsProps = {
  isFilePanelOpen: boolean;
  onFilePanelToggle: () => void;
};

export function SessionTabs({ isFilePanelOpen, onFilePanelToggle }: SessionTabsProps) {
  return (
    <header className="flex h-11 shrink-0 items-stretch border-b bg-surface">
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden" role="tablist">
        <div className="group relative flex w-48 shrink-0 items-stretch border-r bg-workspace">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="flex min-w-0 flex-1 items-center gap-2 px-3 pr-9 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="truncate">欢迎</span>
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="关闭标签页"
                className="absolute top-2 right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关闭标签页</TooltipContent>
          </Tooltip>

          <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="新建连接标签页"
              className="m-1.5"
            >
              <Plus data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建连接</TooltipContent>
        </Tooltip>
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
