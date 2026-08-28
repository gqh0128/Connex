import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilePanelProps = {
  className?: string;
  onClose?: () => void;
};

export function FilePanel({ className, onClose }: FilePanelProps) {
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-l border-border bg-surface",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Folder className="size-3.5 text-primary" />
          远程文件
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

      <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-[11px] text-muted-foreground">
        <button type="button" className="transition hover:text-foreground">
          /
        </button>
        <ChevronRight className="mx-1 size-3" />
        <span>等待连接</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem] border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        <span>名称</span>
        <span>大小</span>
        <span className="text-right">修改时间</span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-5">
        <div className="max-w-48 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl border border-border bg-surface">
            <Folder className="size-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-foreground/80">尚未连接</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            建立 SSH 会话后，可以在这里浏览和传输远程文件。
          </p>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        暂无传输任务
      </div>
    </aside>
  );
}

type PanelButtonProps = {
  label: string;
  icon: typeof Upload;
  disabled?: boolean;
  onClick?: () => void;
};

function PanelButton({ label, icon: Icon, disabled, onClick }: PanelButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}
