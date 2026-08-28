import {
  Clock3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AppView } from "@/types/navigation";

type ConnectionSidebarProps = {
  isCollapsed: boolean;
  onCollapseToggle: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
};

export function ConnectionSidebar({
  isCollapsed,
  onCollapseToggle,
  activeView,
  onViewChange,
}: ConnectionSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar">
      {isCollapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-2 px-2 py-2">
          <IconAction label="新建 SSH 连接" variant="default">
            <Plus data-icon="inline-start" />
          </IconAction>
          <IconAction label="展开连接侧栏" onClick={onCollapseToggle}>
            <PanelLeftOpen data-icon="inline-start" />
          </IconAction>
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <InputGroup size="sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput aria-label="搜索连接" placeholder="搜索连接" />
          </InputGroup>
          <Button type="button" size="icon" aria-label="新建 SSH 连接">
            <Plus data-icon="inline-start" />
          </Button>
          <IconAction label="收起连接侧栏" onClick={onCollapseToggle}>
            <PanelLeftClose data-icon="inline-start" />
          </IconAction>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <nav
          className={cn("flex flex-col gap-4 pb-3", isCollapsed ? "px-2" : "px-2.5")}
        >
          <div className="flex flex-col gap-1">
            <SidebarItem
              icon={Clock3}
              label="最近使用"
              isCollapsed={isCollapsed}
              isActive={activeView === "workspace"}
              onClick={() => onViewChange("workspace")}
            />
            <SidebarItem
              icon={Server}
              label="全部连接"
              count={0}
              isCollapsed={isCollapsed}
              onClick={() => onViewChange("workspace")}
            />
          </div>

          {isCollapsed ? null : (
            <div className="flex flex-col gap-2">
              <div className="flex h-7 items-center justify-between px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>连接分组</span>
                <IconAction label="新建连接分组" size="icon-sm">
                  <Plus data-icon="inline-start" />
                </IconAction>
              </div>

              <Empty size="compact" className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Server />
                  </EmptyMedia>
                  <EmptyTitle>暂无连接</EmptyTitle>
                  <EmptyDescription>新建连接或导入 SSH 配置</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}

type IconActionProps = {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "ghost";
  size?: "icon" | "icon-sm";
};

function IconAction({
  label,
  children,
  onClick,
  variant = "ghost",
  size = "icon",
}: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

type SidebarItemProps = {
  icon: LucideIcon;
  label: string;
  count?: number;
  isCollapsed: boolean;
  isActive?: boolean;
  onClick?: () => void;
};

function SidebarItem({
  icon: Icon,
  label,
  count,
  isCollapsed,
  isActive = false,
  onClick,
}: SidebarItemProps) {
  const button = (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size={isCollapsed ? "icon" : "sm"}
      aria-label={isCollapsed ? label : undefined}
      className={cn("w-full", !isCollapsed && "justify-start")}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
      {isCollapsed ? null : (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      )}
      {!isCollapsed && count !== undefined ? (
        <Badge variant="secondary">{count}</Badge>
      ) : null}
    </Button>
  );

  if (!isCollapsed) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
