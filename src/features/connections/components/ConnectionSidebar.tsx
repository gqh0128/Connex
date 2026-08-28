import {
  Clock3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Server,
  Settings,
} from "lucide-react";

import { ConnexMark } from "@/components/brand/ConnexMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ConnectionSidebarProps = {
  isCollapsed: boolean;
  onCollapseToggle: () => void;
};

export function ConnectionSidebar({
  isCollapsed,
  onCollapseToggle,
}: ConnectionSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar">
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5",
          isCollapsed ? "justify-center px-2" : "px-3.5",
        )}
      >
        <ConnexMark />
        {isCollapsed ? null : (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">Connex</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                SSH workspace
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="收起连接侧栏"
              onClick={onCollapseToggle}
            >
              <PanelLeftClose />
            </Button>
          </>
        )}
      </div>

      {isCollapsed ? (
        <div className="flex flex-col items-center gap-2 px-2 pb-3">
          <Button type="button" size="icon" aria-label="新建 SSH 连接">
            <Plus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="展开连接侧栏"
            onClick={onCollapseToggle}
          >
            <PanelLeftOpen />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索连接"
              placeholder="搜索连接"
              className="h-8 bg-background/60 pl-8 text-xs"
            />
          </div>
          <Button type="button" size="icon" aria-label="新建 SSH 连接">
            <Plus />
          </Button>
        </div>
      )}

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-3",
          isCollapsed ? "px-2" : "px-2.5",
        )}
      >
        <div className="mb-4 space-y-0.5">
          <SidebarItem icon={Clock3} label="最近使用" isCollapsed={isCollapsed} />
          <SidebarItem
            icon={Server}
            label="全部连接"
            count={0}
            isCollapsed={isCollapsed}
          />
        </div>

        {isCollapsed ? null : (
          <>
            <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>连接分组</span>
              <button
                type="button"
                aria-label="新建连接分组"
                className="rounded p-0.5 transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            <div className="rounded-lg border border-dashed border-border/80 px-3 py-5 text-center">
              <Server className="mx-auto mb-2 size-5 text-muted-foreground/60" />
              <p className="text-xs font-medium text-foreground/80">暂无连接</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                新建连接或导入 SSH 配置
              </p>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-border p-2.5">
        <SidebarItem icon={Settings} label="设置" isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}

type SidebarItemProps = {
  icon: typeof Server;
  label: string;
  count?: number;
  isCollapsed: boolean;
};

function SidebarItem({ icon: Icon, label, count, isCollapsed }: SidebarItemProps) {
  return (
    <button
      type="button"
      aria-label={isCollapsed ? label : undefined}
      title={isCollapsed ? label : undefined}
      className={cn(
        "flex h-8 w-full items-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        isCollapsed ? "justify-center px-0" : "gap-2 px-2",
      )}
    >
      <Icon className="size-3.5" />
      {isCollapsed ? null : <span className="flex-1 text-left">{label}</span>}
      {!isCollapsed && count !== undefined ? (
        <span className="font-mono text-[10px] text-muted-foreground/70">{count}</span>
      ) : null}
    </button>
  );
}
