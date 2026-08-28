import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  ChevronRight,
  Copy,
  Download,
  File,
  FileQuestion,
  FileSymlink,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RemoteFilesController } from "@/features/sftp/hooks/useRemoteFiles";
import { canWriteClipboardText, writeClipboardText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { SessionSnapshot } from "@/types/sessions";
import type { RemoteFileEntry, RemoteFileKind } from "@/types/sftp";

type FilePanelProps = {
  session: SessionSnapshot | null;
  browser: RemoteFilesController;
  isSelectingUpload?: boolean;
  onUpload?: () => void;
  className?: string;
  onClose?: () => void;
};

export function FilePanel({
  session,
  browser,
  isSelectingUpload = false,
  onUpload,
  className,
  onClose,
}: FilePanelProps) {
  const { directory, isConnected, isLoading } = browser;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <aside
          className={cn("flex h-full min-h-0 flex-col border-l bg-surface", className)}
        >
          <div className="flex h-9 shrink-0 items-center justify-end border-b px-1">
            <div className="flex items-center gap-0.5">
              <PanelButton
                label={isSelectingUpload ? "正在选择文件" : "上传文件"}
                icon={Upload}
                disabled={
                  !isConnected ||
                  !directory ||
                  isLoading ||
                  isSelectingUpload ||
                  !onUpload
                }
                onClick={onUpload}
              />
              <PanelButton label="下载文件" icon={Download} disabled />
              <PanelButton label="新建目录" icon={FolderPlus} disabled />
              <PanelButton
                label={isLoading ? "正在刷新" : "刷新"}
                icon={RefreshCw}
                iconClassName={cn(
                  isLoading && "animate-spin motion-reduce:animate-none",
                )}
                disabled={!isConnected || isLoading}
                onClick={browser.refresh}
              />
              <PanelButton label="更多操作" icon={MoreHorizontal} disabled />
              {onClose ? (
                <PanelButton label="关闭文件面板" icon={X} onClick={onClose} />
              ) : null}
            </div>
          </div>

          <RemotePath
            path={directory?.path ?? null}
            isConnected={isConnected}
            isLoading={isLoading}
            canGoBack={browser.canGoBack}
            canGoForward={browser.canGoForward}
            onGoBack={browser.goBack}
            onGoForward={browser.goForward}
            onNavigate={browser.openDirectory}
          />

          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem] border-b px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>名称</span>
            <span>大小</span>
            <span className="text-right">修改时间</span>
          </div>

          <FilePanelContent session={session} browser={browser} />
        </aside>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem
            disabled={
              !isConnected || !directory || isLoading || isSelectingUpload || !onUpload
            }
            onSelect={onUpload}
          >
            <Upload />
            上传文件…
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!isConnected || isLoading}
            onSelect={browser.refresh}
          >
            <RefreshCw />
            刷新目录
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

type FilePanelContentProps = {
  session: SessionSnapshot | null;
  browser: RemoteFilesController;
};

function FilePanelContent({ session, browser }: FilePanelContentProps) {
  const { directory, error, isLoading } = browser;

  if (!session) {
    return (
      <PanelEmpty
        icon={Folder}
        title="尚未连接"
        description="建立 SSH 会话后，会自动连接并读取远程默认目录。"
      />
    );
  }

  if (session.state !== "connected") {
    const isConnecting = ["connecting", "verifyingHost", "authenticating"].includes(
      session.state,
    );

    return (
      <PanelEmpty
        icon={isConnecting ? LoaderCircle : Folder}
        iconClassName={cn(isConnecting && "animate-spin motion-reduce:animate-none")}
        title={isConnecting ? "正在连接远程文件" : "远程文件已断开"}
        description={
          isConnecting
            ? "SSH 认证完成后会自动打开 SFTP 文件通道。"
            : "重新建立 SSH 会话后即可继续浏览远程目录。"
        }
      />
    );
  }

  if (error) {
    return (
      <PanelEmpty
        icon={CircleAlert}
        title="无法读取远程文件"
        description={error.message}
      >
        <Button type="button" variant="outline" size="sm" onClick={browser.retry}>
          <RefreshCw data-icon="inline-start" />
          重试
        </Button>
      </PanelEmpty>
    );
  }

  if (isLoading && !directory) {
    return (
      <PanelEmpty
        icon={LoaderCircle}
        iconClassName="animate-spin motion-reduce:animate-none"
        title="正在读取默认目录"
        description="文件列表会在 SFTP 通道就绪后显示。"
      />
    );
  }

  if (!directory || directory.entries.length === 0) {
    return (
      <PanelEmpty
        icon={FolderOpen}
        title="目录为空"
        description="这个远程目录中没有可显示的文件。"
      />
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1" aria-busy={isLoading}>
      <div role="list" aria-label={`${directory.path} 的远程文件`}>
        {directory.entries.map((entry) => (
          <RemoteFileRow
            key={entry.path}
            entry={entry}
            onOpenDirectory={browser.openDirectory}
            onRefresh={browser.refresh}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

type PanelEmptyProps = {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
};

function PanelEmpty({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
}: PanelEmptyProps) {
  return (
    <Empty size="compact" className="min-h-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className={iconClassName} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}

type RemotePathProps = {
  path: string | null;
  isConnected: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onNavigate: (path: string) => void;
};

function RemotePath({
  path,
  isConnected,
  isLoading,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onNavigate,
}: RemotePathProps) {
  const breadcrumbs = path ? getPathBreadcrumbs(path) : [];

  return (
    <nav
      aria-label="远程目录路径"
      className="flex h-9 shrink-0 items-center overflow-hidden border-b px-1 text-[11px] text-muted-foreground"
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <PanelButton
          label="后退"
          icon={ArrowLeft}
          disabled={!canGoBack || isLoading}
          onClick={onGoBack}
        />
        <PanelButton
          label="前进"
          icon={ArrowRight}
          disabled={!canGoForward || isLoading}
          onClick={onGoForward}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center overflow-hidden px-2">
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((breadcrumb, index) => {
            const isCurrent = index === breadcrumbs.length - 1;

            return (
              <div
                key={`${breadcrumb.path}-${index}`}
                className="flex min-w-0 items-center"
              >
                {index > 0 ? <ChevronRight className="mx-1 size-3 shrink-0" /> : null}
                <button
                  type="button"
                  className={cn(
                    "truncate rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isCurrent && "text-foreground",
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                  disabled={isCurrent || isLoading}
                  onClick={() => onNavigate(breadcrumb.path)}
                >
                  {breadcrumb.label}
                </button>
              </div>
            );
          })
        ) : (
          <span className="truncate">
            {isConnected
              ? isLoading
                ? "正在读取默认目录"
                : "等待远程目录"
              : "等待连接"}
          </span>
        )}
      </div>
    </nav>
  );
}

type PathBreadcrumb = {
  label: string;
  path: string;
};

function getPathBreadcrumbs(path: string): PathBreadcrumb[] {
  const isAbsolute = path.startsWith("/");
  const segments = path.split("/").filter(Boolean);
  const breadcrumbs: PathBreadcrumb[] = isAbsolute ? [{ label: "/", path: "/" }] : [];
  let currentPath = isAbsolute ? "" : ".";

  for (const segment of segments) {
    currentPath = isAbsolute
      ? `${currentPath}/${segment}`
      : currentPath === "."
        ? segment
        : `${currentPath}/${segment}`;
    breadcrumbs.push({ label: segment, path: currentPath });
  }

  return breadcrumbs.length > 0 ? breadcrumbs : [{ label: path, path }];
}

type RemoteFileRowProps = {
  entry: RemoteFileEntry;
  onOpenDirectory: (path: string) => void;
  onRefresh: () => void;
};

function RemoteFileRow({ entry, onOpenDirectory, onRefresh }: RemoteFileRowProps) {
  const name = (
    <span className="flex min-w-0 items-center gap-2">
      <RemoteFileIcon kind={entry.kind} />
      <span className="truncate">{entry.name}</span>
    </span>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="listitem"
          className="grid min-h-8 grid-cols-[minmax(0,1fr)_4.5rem_4rem] items-center border-b px-3 text-xs last:border-b-0 hover:bg-accent/60 data-[state=open]:bg-accent/60"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <div className="min-w-0">
            {entry.kind === "directory" ? (
              <button
                type="button"
                className="block w-full min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onOpenDirectory(entry.path)}
              >
                {name}
              </button>
            ) : (
              name
            )}
          </div>
          <div className="truncate tabular-nums text-muted-foreground">
            {formatFileSize(entry)}
          </div>
          <div className="truncate text-right tabular-nums text-muted-foreground">
            {formatModifiedAt(entry.modifiedAt)}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {entry.kind === "directory" ? (
          <>
            <ContextMenuGroup>
              <ContextMenuItem onSelect={() => onOpenDirectory(entry.path)}>
                <FolderOpen />
                打开目录
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuGroup>
          <ContextMenuItem
            disabled={!canWriteClipboardText()}
            onSelect={() => {
              void writeClipboardText(entry.path).catch(() => undefined);
            }}
          >
            <Copy />
            复制路径
          </ContextMenuItem>
          <ContextMenuItem onSelect={onRefresh}>
            <RefreshCw />
            刷新所在目录
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RemoteFileIcon({ kind }: { kind: RemoteFileKind }) {
  const className = cn(
    "size-3.5 shrink-0",
    kind === "directory" ? "text-primary" : "text-muted-foreground",
  );

  switch (kind) {
    case "directory":
      return <Folder className={className} />;
    case "file":
      return <File className={className} />;
    case "symlink":
      return <FileSymlink className={className} />;
    case "other":
      return <FileQuestion className={className} />;
  }
}

function formatFileSize(entry: RemoteFileEntry) {
  if (entry.kind === "directory" || entry.size === null) {
    return "—";
  }

  if (entry.size < 1024) {
    return `${entry.size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = entry.size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatModifiedAt(modifiedAt: number | null) {
  if (modifiedAt === null) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(modifiedAt * 1000));
}

type PanelButtonProps = {
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
  disabled?: boolean;
  onClick?: () => void;
};

function PanelButton({
  label,
  icon: Icon,
  iconClassName,
  disabled,
  onClick,
}: PanelButtonProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" className={iconClassName} />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
