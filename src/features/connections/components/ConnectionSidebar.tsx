import { Plus, RefreshCw, Search, Server } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { writeClipboardText } from "@/lib/clipboard";
import { getCommandError } from "@/lib/tauri/errors";
import { cn } from "@/lib/utils";
import type { ConnectionProfile, SaveConnectionInput } from "@/types/connections";

import { ConnectionFormDialog } from "./ConnectionFormDialog";
import { ConnectionListItem } from "./ConnectionListItem";
import { useConnections } from "../hooks/useConnections";

type ConnectionSidebarProps = {
  isCollapsed: boolean;
  activeConnectionId: string | null;
  onConnect: (connection: ConnectionProfile) => void;
};

export type ConnectionSidebarHandle = {
  openCreateForm: () => void;
  refreshConnections: () => void;
};

export const ConnectionSidebar = forwardRef<
  ConnectionSidebarHandle,
  ConnectionSidebarProps
>(function ConnectionSidebar({ isCollapsed, activeConnectionId, onConnect }, ref) {
  const {
    connections,
    isLoading,
    loadError,
    create,
    update,
    remove,
    revealCredential,
    refreshConnections,
  } = useConnections();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionProfile | null>(
    null,
  );
  const [deletingConnection, setDeletingConnection] =
    useState<ConnectionProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const visibleConnections = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) {
      return connections;
    }

    return connections.filter((connection) =>
      [connection.name, connection.host, connection.username]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [connections, searchQuery]);

  useEffect(() => {
    if (!isSearchOpen || isCollapsed) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isCollapsed, isSearchOpen]);

  const openCreateDialog = () => {
    setEditingConnection(null);
    setFormKey((current) => current + 1);
    setIsFormOpen(true);
  };

  const openEditDialog = (connection: ConnectionProfile) => {
    setEditingConnection(connection);
    setFormKey((current) => current + 1);
    setIsFormOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreateForm: openCreateDialog,
    refreshConnections: () => void refreshConnections(),
  }));

  const saveConnection = (input: SaveConnectionInput) => {
    if (editingConnection) {
      return update(editingConnection.id, input);
    }

    return create(input);
  };

  const handleDeleteConnection = async () => {
    if (!deletingConnection) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await remove(deletingConnection.id);
      setDeletingConnection(null);
    } catch (error) {
      setDeleteError(getCommandError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSearch = () => {
    setIsSearchOpen((isOpen) => {
      if (isOpen) {
        setSearchQuery("");
      }

      return !isOpen;
    });
  };

  return (
    <>
      <aside
        id="connection-sidebar"
        aria-hidden={isCollapsed}
        inert={isCollapsed}
        className={cn(
          "flex h-full min-h-0 flex-col bg-sidebar",
          isCollapsed && "invisible",
        )}
      >
        <header className="flex h-10 shrink-0 items-center justify-between px-3">
          <h2 className="truncate text-xs font-semibold">连接列表</h2>
          <div className="flex items-center gap-0.5">
            <IconAction
              label={isSearchOpen ? "关闭搜索" : "搜索连接"}
              variant={isSearchOpen ? "secondary" : "ghost"}
              ariaPressed={isSearchOpen}
              onClick={toggleSearch}
            >
              <Search data-icon="inline-start" />
            </IconAction>
            <IconAction label="新建 SSH 连接" onClick={openCreateDialog}>
              <Plus data-icon="inline-start" />
            </IconAction>
          </div>
        </header>

        {isSearchOpen ? (
          <div className="shrink-0 px-2.5 pb-2">
            <InputGroup size="sm">
              <InputGroupInput
                ref={searchInputRef}
                aria-label="搜索连接"
                placeholder="搜索名称、主机或用户名"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }
                }}
              />
            </InputGroup>
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <nav aria-label="连接列表" className="flex flex-col gap-1 px-2.5 pb-3 pt-1">
            {isLoading ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">正在加载连接…</p>
            ) : loadError ? (
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <p role="alert" className="px-2 py-3 text-xs text-destructive">
                    {loadError.message}
                  </p>
                </div>
                <IconAction
                  label="重新加载连接"
                  onClick={() => void refreshConnections()}
                >
                  <RefreshCw data-icon="inline-start" />
                </IconAction>
              </div>
            ) : visibleConnections.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {visibleConnections.map((connection) => (
                  <ConnectionListItem
                    key={connection.id}
                    connection={connection}
                    isActive={connection.id === activeConnectionId}
                    onConnect={() => onConnect(connection)}
                    onEdit={() => openEditDialog(connection)}
                    onCopyAddress={() => {
                      void writeClipboardText(
                        `${connection.username}@${connection.host}:${connection.port}`,
                      ).catch(() => undefined);
                    }}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeletingConnection(connection);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Empty size="compact">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Server />
                  </EmptyMedia>
                  <EmptyTitle>{searchQuery ? "没有匹配的连接" : "暂无连接"}</EmptyTitle>
                  <EmptyDescription>
                    {searchQuery
                      ? "尝试搜索名称、主机或用户名"
                      : "新建连接或导入 SSH 配置"}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </nav>
        </ScrollArea>
      </aside>

      <ConnectionFormDialog
        key={formKey}
        open={isFormOpen}
        connection={editingConnection}
        onOpenChange={setIsFormOpen}
        onSubmit={saveConnection}
        onRevealCredential={
          editingConnection ? () => revealCredential(editingConnection.id) : undefined
        }
        onDelete={editingConnection ? () => remove(editingConnection.id) : undefined}
      />

      <AlertDialog
        open={deletingConnection !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeleting) {
            setDeletingConnection(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deletingConnection?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              连接配置和已保存的凭据都会从这台设备移除，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConnection();
              }}
            >
              {isDeleting ? "正在删除…" : "删除连接"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

type IconActionProps = {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "secondary" | "ghost";
  ariaPressed?: boolean;
};

function IconAction({
  label,
  children,
  onClick,
  variant = "ghost",
  ariaPressed,
}: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon-sm"
          aria-label={label}
          aria-pressed={ariaPressed}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
