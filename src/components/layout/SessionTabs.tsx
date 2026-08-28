import { Files, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SessionTabsProps = {
  isFilePanelOpen: boolean;
  onFilePanelToggle: () => void;
};

export function SessionTabs({
  isFilePanelOpen,
  onFilePanelToggle,
}: SessionTabsProps) {
  return (
    <header className="flex h-11 shrink-0 items-stretch border-b border-border bg-surface/80">
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <div className="group relative flex w-48 shrink-0 items-center gap-2 border-r border-border bg-workspace px-3 text-xs text-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          <span className="min-w-0 flex-1 truncate">欢迎</span>
          <button
            type="button"
            aria-label="关闭标签页"
            className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
          <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="新建连接标签页"
          className="m-1.5 size-8 text-muted-foreground"
        >
          <Plus />
        </Button>
      </div>

      <div className="flex items-center border-l border-border px-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={isFilePanelOpen}
          onClick={onFilePanelToggle}
          className={cn(
            "h-8 text-muted-foreground",
            isFilePanelOpen && "bg-accent text-foreground",
          )}
        >
          <Files />
          文件
        </Button>
      </div>
    </header>
  );
}
