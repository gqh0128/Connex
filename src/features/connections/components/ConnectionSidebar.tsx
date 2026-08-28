import { ChevronsUpDown, Clock3, Plus, Search, Server, Settings } from "lucide-react";

import { ConnexMark } from "@/components/brand/ConnexMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConnectionSidebar() {
  return (
    <aside className="row-span-1 flex min-h-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-3.5">
        <ConnexMark />
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
          aria-label="打开工作区菜单"
          className="text-muted-foreground"
        >
          <ChevronsUpDown />
        </Button>
      </div>

      <div className="flex items-center gap-2 px-3 pb-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        <div className="mb-4 space-y-0.5">
          <SidebarItem icon={Clock3} label="最近使用" />
          <SidebarItem icon={Server} label="全部连接" count={0} />
        </div>

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
      </nav>

      <div className="border-t border-border p-2.5">
        <SidebarItem icon={Settings} label="设置" />
      </div>
    </aside>
  );
}

type SidebarItemProps = {
  icon: typeof Server;
  label: string;
  count?: number;
};

function SidebarItem({ icon: Icon, label, count }: SidebarItemProps) {
  return (
    <button
      type="button"
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-3.5" />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-[10px] text-muted-foreground/70">{count}</span>
      ) : null}
    </button>
  );
}
