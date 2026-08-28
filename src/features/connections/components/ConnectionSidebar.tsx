import {
  Clock3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Server,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
import type { ConnectionProfile, SaveConnectionInput } from "@/types/connections";
import type { AppView } from "@/types/navigation";

import { ConnectionFormSheet } from "./ConnectionFormSheet";
import { ConnectionListItem } from "./ConnectionListItem";
import { useConnections } from "../hooks/useConnections";

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
  const {
    connections,
    isLoading,
    loadError,
    create,
    update,
    remove,
    refreshConnections,
  } = useConnections();
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionScope, setConnectionScope] = useState<"recent" | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionProfile | null>(
    null,
  );
  const [formKey, setFormKey] = useState(0);
  const visibleConnections = useMemo(() => {
    const scopedConnections =
      connectionScope === "recent"
        ? connections.filter((connection) => connection.lastConnectedAt)
        : connections;
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) {
      return scopedConnections;
    }

    return scopedConnections.filter((connection) =>
      [connection.name, connection.host, connection.username]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [connectionScope, connections, searchQuery]);

  const openCreateSheet = () => {
    setEditingConnection(null);
    setFormKey((current) => current + 1);
    setIsFormOpen(true);
  };

  const openEditSheet = (connection: ConnectionProfile) => {
    setEditingConnection(connection);
    setFormKey((current) => current + 1);
    setIsFormOpen(true);
  };

  const saveConnection = (input: SaveConnectionInput) => {
    if (editingConnection) {
      return update(editingConnection.id, input);
    }

    return create(input);
  };

  return (
    <>
      <aside className="flex h-full min-h-0 flex-col bg-sidebar">
        {isCollapsed ? (
          <div className="flex shrink-0 flex-col items-center gap-2 px-2 py-2">
            <IconAction
              label="新建 SSH 连接"
              variant="default"
              onClick={openCreateSheet}
            >
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
              <InputGroupInput
                aria-label="搜索连接"
                placeholder="搜索连接"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </InputGroup>
            <Button
              type="button"
              size="icon"
              aria-label="新建 SSH 连接"
              onClick={openCreateSheet}
            >
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
                isActive={activeView === "workspace" && connectionScope === "recent"}
                onClick={() => {
                  setConnectionScope("recent");
                  onViewChange("workspace");
                }}
              />
              <SidebarItem
                icon={Server}
                label="全部连接"
                count={connections.length}
                isCollapsed={isCollapsed}
                isActive={activeView === "workspace" && connectionScope === "all"}
                onClick={() => {
                  setConnectionScope("all");
                  onViewChange("workspace");
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              {isCollapsed ? null : (
                <div className="flex h-7 items-center justify-between px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span>{searchQuery ? "搜索结果" : "连接"}</span>
                  {loadError ? (
                    <IconAction
                      label="重新加载连接"
                      size="icon-sm"
                      onClick={() => void refreshConnections()}
                    >
                      <RefreshCw data-icon="inline-start" />
                    </IconAction>
                  ) : null}
                </div>
              )}

              {isLoading ? (
                isCollapsed ? null : (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    正在加载连接…
                  </p>
                )
              ) : loadError ? (
                isCollapsed ? null : (
                  <p role="alert" className="px-2 py-3 text-xs text-destructive">
                    {loadError.message}
                  </p>
                )
              ) : visibleConnections.length > 0 ? (
                <div className={cn("flex flex-col", isCollapsed ? "gap-1" : "gap-0.5")}>
                  {visibleConnections.map((connection) => (
                    <ConnectionListItem
                      key={connection.id}
                      connection={connection}
                      isCollapsed={isCollapsed}
                      onEdit={() => openEditSheet(connection)}
                    />
                  ))}
                </div>
              ) : isCollapsed ? null : (
                <Empty size="compact" className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Server />
                    </EmptyMedia>
                    <EmptyTitle>
                      {searchQuery
                        ? "没有匹配的连接"
                        : connectionScope === "recent"
                          ? "暂无最近连接"
                          : "暂无连接"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {searchQuery
                        ? "尝试搜索名称、主机或用户名"
                        : "新建连接或导入 SSH 配置"}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </nav>
        </ScrollArea>
      </aside>

      <ConnectionFormSheet
        key={formKey}
        open={isFormOpen}
        connection={editingConnection}
        onOpenChange={setIsFormOpen}
        onSubmit={saveConnection}
        onDelete={editingConnection ? () => remove(editingConnection.id) : undefined}
      />
    </>
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
