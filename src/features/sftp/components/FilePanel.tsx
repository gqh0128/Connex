import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type FilePanelProps = {
  className?: string;
  onClose?: () => void;
};

export function FilePanel({ className, onClose }: FilePanelProps) {
  return (
    <aside className={cn("flex min-h-0 flex-col border-l bg-surface", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Folder className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">远程文件</span>
        </div>
        <div className="flex items-center gap-0.5">
          <PanelButton label="上传文件" icon={Upload} />
          <PanelButton label="下载文件" icon={Download} disabled />
          <PanelButton label="新建目录" icon={FolderPlus} disabled />
          <PanelButton label="刷新" icon={RefreshCw} disabled />
          <PanelButton label="更多操作" icon={MoreHorizontal} disabled />
          {onClose ? (
            <PanelButton label="关闭文件面板" icon={X} onClick={onClose} />
          ) : null}
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center border-b px-3 text-[11px] text-muted-foreground">
        <button type="button" className="transition-colors hover:text-foreground">
          /
        </button>
        <ChevronRight className="mx-1 size-3" />
        <span>等待连接</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem] border-b px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>名称</span>
        <span>大小</span>
        <span className="text-right">修改时间</span>
      </div>

      <Empty size="compact" className="min-h-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder />
          </EmptyMedia>
          <EmptyTitle>尚未连接</EmptyTitle>
          <EmptyDescription>
            建立 SSH 会话后，可以在这里浏览和传输远程文件。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </aside>
  );
}

type PanelButtonProps = {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick?: () => void;
};

function PanelButton({ label, icon: Icon, disabled, onClick }: PanelButtonProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
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
