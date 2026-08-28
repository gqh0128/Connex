import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useState } from "react";

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
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FileTransfersController } from "@/features/transfers/hooks/useFileTransfers";
import type { FileTransferStatus, FileTransferTask } from "@/types/transfers";

type TransferPopoverProps = {
  controller: FileTransfersController;
};

export function TransferPopover({ controller }: TransferPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { tasks, activeCount, cancelUpload } = controller;
  const summary = [
    { label: "上传", value: activeCount, icon: ArrowUpFromLine },
    { label: "下载", value: 0, icon: ArrowDownToLine },
  ] as const;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={isOpen ? "secondary" : "ghost"}
              size="icon"
              aria-label={`传输任务，${activeCount} 个活动任务`}
              aria-expanded={isOpen}
            >
              <ArrowUpDown data-icon="inline-start" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>传输任务</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[70vh] w-96 flex-col p-0"
      >
        <PopoverHeader className="p-4 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <PopoverTitle>传输任务</PopoverTitle>
              <PopoverDescription>查看所有连接的上传和下载状态。</PopoverDescription>
            </div>
            <Badge variant={activeCount > 0 ? "default" : "secondary"}>
              {activeCount} 个活动
            </Badge>
          </div>
        </PopoverHeader>

        <Separator />
        <div className="grid grid-cols-2 px-4 py-3">
          {summary.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{value}</span>
            </div>
          ))}
        </div>
        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          {tasks.length > 0 ? (
            <div>
              {tasks.map((task, index) => (
                <Fragment key={task.id}>
                  <TransferRow task={task} onCancel={() => cancelUpload(task.id)} />
                  {index < tasks.length - 1 ? <Separator /> : null}
                </Fragment>
              ))}
            </div>
          ) : (
            <Empty size="compact" className="min-h-48">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ArrowUpDown />
                </EmptyMedia>
                <EmptyTitle>暂无传输任务</EmptyTitle>
                <EmptyDescription>
                  上传或下载文件后，可以在这里查看进度、速度和结果。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

type TransferRowProps = {
  task: FileTransferTask;
  onCancel: () => void;
};

function TransferRow({ task, onCancel }: TransferRowProps) {
  const Icon: LucideIcon = ArrowUpFromLine;

  return (
    <div className="flex items-start gap-3 p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {task.fileName}
          </span>
          <TransferStatusBadge status={task.status} isCancelling={task.isCancelling} />
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {task.connectionName}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatTransferProgress(task)}
        </span>
        {task.errorMessage ? (
          <span className="text-xs text-destructive">{task.errorMessage}</span>
        ) : null}
      </div>
      {task.status === "running" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`取消上传 ${task.fileName}`}
              disabled={task.isCancelling || task.totalBytes === 0}
              onClick={onCancel}
            >
              <X data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>取消上传</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function TransferStatusBadge({
  status,
  isCancelling,
}: {
  status: FileTransferStatus;
  isCancelling: boolean;
}) {
  if (status === "running") {
    return <Badge variant="secondary">{isCancelling ? "取消中" : "上传中"}</Badge>;
  }
  if (status === "completed") {
    return <Badge variant="outline">已完成</Badge>;
  }
  if (status === "cancelled") {
    return <Badge variant="outline">已取消</Badge>;
  }
  return <Badge variant="destructive">失败</Badge>;
}

function formatTransferProgress(task: FileTransferTask) {
  if (task.status === "failed") {
    return `${formatBytes(task.transferredBytes)} 已上传`;
  }
  if (task.status === "cancelled") {
    return `已上传 ${formatBytes(task.transferredBytes)}`;
  }
  if (task.status === "completed") {
    return `${formatBytes(task.totalBytes)} · 上传完成`;
  }
  if (task.totalBytes === 0) {
    return "正在准备上传";
  }

  const percentage = Math.min(
    100,
    Math.round((task.transferredBytes / task.totalBytes) * 100),
  );
  const speed =
    task.bytesPerSecond > 0 ? ` · ${formatBytes(task.bytesPerSecond)}/s` : "";
  return `${percentage}% · ${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)}${speed}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
