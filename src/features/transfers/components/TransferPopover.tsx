import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  Pause,
  Play,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FileTransfersController } from "@/features/transfers/hooks/useFileTransfers";
import {
  getQueueEtaSeconds,
  getTransferEtaSeconds,
} from "@/features/transfers/transferMetrics";
import { cn } from "@/lib/utils";
import type { FileTransferTask } from "@/types/transfers";

type TransferPopoverProps = {
  controller: FileTransfersController;
};

const TRANSFER_CATEGORIES = [
  { id: "running", label: "进行中" },
  { id: "queued", label: "排队中" },
  { id: "paused", label: "已暂停" },
  { id: "failed", label: "失败" },
  { id: "completed", label: "已完成" },
] as const;

type TransferCategory = (typeof TRANSFER_CATEGORIES)[number]["id"];

export function TransferPopover({ controller }: TransferPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<TransferCategory>("running");
  const {
    tasks,
    runningCount,
    waitingCount,
    pausedCount,
    failedCount,
    uploadCount,
    downloadCount,
    concurrencyLimit,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    discardTransfer,
  } = controller;
  const hasRetryingTask = tasks.some((task) => task.status === "retrying");
  const now = useRetryClock(hasRetryingTask);
  const queueEtaSeconds =
    hasRetryingTask && now === 0 ? null : getQueueEtaSeconds(tasks, now);
  const activeQueueCount = runningCount + waitingCount;
  const incompleteCount = activeQueueCount + pausedCount;
  const liveSummary = formatTriggerLabel(
    runningCount,
    waitingCount,
    pausedCount,
    failedCount,
  );
  const queueSummary = formatQueueSummary({
    uploadCount,
    downloadCount,
    runningCount,
    pausedCount,
    concurrencyLimit,
    pendingCount: activeQueueCount,
    queueEtaSeconds,
  });
  const visibleTasks = tasks.filter((task) => isTaskInCategory(task, activeCategory));
  const emptyState = getTransferEmptyState(activeCategory);
  const EmptyIcon = emptyState.icon;

  const handleOpenChange = (nextIsOpen: boolean) => {
    if (nextIsOpen && !isOpen) {
      setActiveCategory(getDefaultTransferCategory(tasks));
    }
    setIsOpen(nextIsOpen);
  };

  const handleCategoryChange = (value: string) => {
    if (isTransferCategory(value)) {
      setActiveCategory(value);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={isOpen ? "secondary" : "ghost"}
              size="icon"
              className="relative"
              aria-label={liveSummary}
              aria-expanded={isOpen}
            >
              <ArrowUpDown data-icon="inline-start" />
              {incompleteCount > 0 ? (
                <Badge
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] tabular-nums"
                >
                  {incompleteCount > 99 ? "99+" : incompleteCount}
                </Badge>
              ) : failedCount > 0 ? (
                <Badge
                  variant="destructive"
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 size-4 p-0 text-[9px]"
                >
                  !
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>传输任务</TooltipContent>
      </Tooltip>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveSummary}
      </span>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex h-[28rem] w-[32rem] flex-col overflow-hidden p-0"
      >
        <PopoverHeader className="shrink-0 gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <PopoverTitle className="shrink-0">传输任务</PopoverTitle>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              共 {tasks.length} 个任务
            </span>
          </div>
          <PopoverDescription className="truncate" title={queueSummary}>
            {queueSummary}
          </PopoverDescription>
        </PopoverHeader>

        <Separator />
        <div className="shrink-0 px-3 py-1.5">
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            spacing={1}
            value={activeCategory}
            onValueChange={handleCategoryChange}
            className="mx-auto"
            aria-label="按状态筛选传输任务"
          >
            {TRANSFER_CATEGORIES.map((category) => {
              const count = getTransferCategoryCount(tasks, category.id);
              return (
                <ToggleGroupItem
                  key={category.id}
                  value={category.id}
                  className="relative min-w-[4.25rem]"
                  aria-label={`${category.label}，${count} 个任务`}
                >
                  <Badge
                    variant={activeCategory === category.id ? "default" : "secondary"}
                    size="counter"
                    className="pointer-events-none absolute -top-1.5 -left-1.5"
                    aria-hidden="true"
                  >
                    {count > 99 ? "99+" : count}
                  </Badge>
                  {category.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {visibleTasks.length > 0 ? (
            <ul aria-label={`${getTransferCategoryLabel(activeCategory)}传输任务列表`}>
              {visibleTasks.map((task, index) => (
                <li key={task.id}>
                  <TransferRow
                    task={task}
                    now={now}
                    onPause={() => pauseTransfer(task.id)}
                    onResume={() => resumeTransfer(task.id)}
                    onCancel={() => cancelTransfer(task.id)}
                    onRetry={() => retryTransfer(task.id)}
                    onDiscard={() => discardTransfer(task.id)}
                  />
                  {index < visibleTasks.length - 1 ? <Separator /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty size="compact" className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <EmptyIcon />
                </EmptyMedia>
                <EmptyTitle>{emptyState.title}</EmptyTitle>
                <EmptyDescription>{emptyState.description}</EmptyDescription>
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
  now: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
};

function TransferRow({
  task,
  now,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDiscard,
}: TransferRowProps) {
  const Icon: LucideIcon =
    task.direction === "upload" ? ArrowUpFromLine : ArrowDownToLine;
  const percentage = getTransferPercentage(task);
  const directionLabel = task.direction === "upload" ? "上传" : "下载";
  const status = getTransferStatus(task);
  const detail = formatTransferDetail(task, now);

  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3rem] items-start gap-2 px-3 py-1">
      <div
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2 leading-4">
          <span className="sr-only">{directionLabel}：</span>
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium"
            title={task.fileName}
          >
            {task.fileName}
          </span>
          <span
            className={cn(
              "text-right text-[11px] tabular-nums",
              status.isDestructive ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {status.label}
          </span>
        </div>
        <TransferMetadata task={task} detail={detail} />
        {percentage !== null &&
        (task.status === "running" || task.status === "paused") ? (
          <div className="relative h-4">
            <Progress
              className="h-4"
              value={percentage}
              aria-label={`${directionLabel} ${task.fileName}`}
              aria-valuetext={`${percentage}%`}
            />
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium leading-none tabular-nums text-foreground"
              aria-hidden="true"
            >
              <span className="rounded-sm bg-popover/80 px-1">{percentage}%</span>
            </span>
          </div>
        ) : null}
        {task.errorMessage ? (
          <span
            className="truncate text-[11px] leading-4 text-destructive"
            title={task.errorMessage}
          >
            {task.errorMessage}
          </span>
        ) : null}
      </div>
      <div className="flex w-12 items-center justify-end">
        <TransferActions
          task={task}
          directionLabel={directionLabel}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
          onRetry={onRetry}
          onDiscard={onDiscard}
        />
      </div>
    </div>
  );
}

type TransferActionsProps = {
  task: FileTransferTask;
  directionLabel: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
};

function TransferActions({
  task,
  directionLabel,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDiscard,
}: TransferActionsProps) {
  const canPause = ["queued", "running", "retrying"].includes(task.status);
  const canCancel = canPause || task.status === "paused";
  const cancelActionLabel = task.isReleaseBlocked ? "重新释放" : "取消";
  const isControlDisabled = task.isCancelling || task.isPausing;

  if (canCancel) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`${task.status === "paused" ? "继续" : "暂停"}${directionLabel} ${task.fileName}`}
              disabled={isControlDisabled}
              onClick={task.status === "paused" ? onResume : onPause}
            >
              {task.status === "paused" ? (
                <Play data-icon="inline-start" />
              ) : (
                <Pause data-icon="inline-start" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {task.status === "paused" ? "继续" : "暂停"}
            {directionLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`${cancelActionLabel}${directionLabel} ${task.fileName}`}
              disabled={isControlDisabled}
              onClick={onCancel}
            >
              <X data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {cancelActionLabel}
            {directionLabel}
          </TooltipContent>
        </Tooltip>
      </>
    );
  }

  if (task.status !== "failed" || !task.canRetry) {
    return null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`重试${directionLabel} ${task.fileName}`}
            disabled={task.isCancelling}
            onClick={onRetry}
          >
            <RotateCcw data-icon="inline-start" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>重试{directionLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`放弃重试${directionLabel} ${task.fileName}`}
            disabled={task.isCancelling}
            onClick={onDiscard}
          >
            <X data-icon="inline-start" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>放弃重试并释放目标</TooltipContent>
      </Tooltip>
    </>
  );
}

function TransferMetadata({
  task,
  detail,
}: {
  task: FileTransferTask;
  detail: string;
}) {
  if (task.status === "running" && task.totalBytes !== null) {
    const speed =
      task.bytesPerSecond > 0 ? `${formatBytes(task.bytesPerSecond)}/s` : "估算中";
    const etaSeconds = getTransferEtaSeconds(task);
    const eta = etaSeconds === null ? "剩余估算中" : `剩 ${formatDuration(etaSeconds)}`;

    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="truncate" title={task.connectionName}>
          {task.connectionName}
        </span>
        <span className="whitespace-nowrap tabular-nums">
          {formatBytes(task.transferredBytes)} / {formatBytes(task.totalBytes)}
        </span>
        <span className="whitespace-nowrap tabular-nums">{speed}</span>
        <span className="whitespace-nowrap text-right tabular-nums">{eta}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
      <span className="max-w-[10rem] shrink-0 truncate" title={task.connectionName}>
        {task.connectionName}
      </span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 flex-1 truncate tabular-nums" title={detail}>
        {detail}
      </span>
    </div>
  );
}

function isTransferCategory(value: string): value is TransferCategory {
  return TRANSFER_CATEGORIES.some((category) => category.id === value);
}

function isTaskInCategory(task: FileTransferTask, category: TransferCategory) {
  switch (category) {
    case "running":
      return task.status === "running";
    case "queued":
      return task.status === "queued" || task.status === "retrying";
    case "paused":
      return task.status === "paused";
    case "failed":
      return task.status === "failed";
    case "completed":
      return task.status === "completed" || task.status === "cancelled";
  }
}

function getTransferCategoryCount(
  tasks: FileTransferTask[],
  category: TransferCategory,
) {
  return tasks.filter((task) => isTaskInCategory(task, category)).length;
}

function getDefaultTransferCategory(tasks: FileTransferTask[]): TransferCategory {
  const priority: TransferCategory[] = [
    "running",
    "queued",
    "paused",
    "failed",
    "completed",
  ];
  return (
    priority.find((category) => getTransferCategoryCount(tasks, category) > 0) ??
    "running"
  );
}

function getTransferCategoryLabel(category: TransferCategory) {
  return TRANSFER_CATEGORIES.find((item) => item.id === category)?.label ?? "传输";
}

function getTransferEmptyState(category: TransferCategory): {
  icon: LucideIcon;
  title: string;
  description: string;
} {
  switch (category) {
    case "running":
      return {
        icon: ArrowUpDown,
        title: "暂无进行中的任务",
        description: "新传输开始后会在这里实时显示速度和剩余时间。",
      };
    case "queued":
      return {
        icon: ArrowUpDown,
        title: "暂无排队任务",
        description: "达到并发上限后，等待中的任务会显示在这里。",
      };
    case "paused":
      return {
        icon: Pause,
        title: "暂无已暂停任务",
        description: "暂停任务后，可以从当前断点继续上传或下载。",
      };
    case "failed":
      return {
        icon: ArrowUpDown,
        title: "暂无失败任务",
        description: "最终失败且可以恢复的任务会在这里提供重试操作。",
      };
    case "completed":
      return {
        icon: ArrowUpDown,
        title: "暂无已完成任务",
        description: "已经完成或取消的传输记录会显示在这里。",
      };
  }
}

function getTransferStatus(task: FileTransferTask) {
  const directionLabel = task.direction === "upload" ? "上传" : "下载";
  if (task.isCancelling) {
    return { label: "取消中", isDestructive: false };
  }
  if (task.isPausing) {
    return { label: "暂停中", isDestructive: false };
  }
  if (task.isReleaseBlocked) {
    return { label: "待释放", isDestructive: true };
  }

  switch (task.status) {
    case "queued":
      return { label: "等待", isDestructive: false };
    case "running":
      return { label: `${directionLabel}中`, isDestructive: false };
    case "retrying":
      return {
        label: `重试 ${task.attempt + 1}/${task.maxAttempts}`,
        isDestructive: false,
      };
    case "paused":
      return { label: "已暂停", isDestructive: false };
    case "completed":
      return { label: "完成", isDestructive: false };
    case "cancelled":
      return { label: "已取消", isDestructive: false };
    case "failed":
      return { label: "失败", isDestructive: true };
  }
}

function formatTransferDetail(task: FileTransferTask, now: number) {
  const action = task.direction === "upload" ? "上传" : "下载";
  if (task.isReleaseBlocked) {
    return `等待重新释放${action}目标`;
  }
  if (task.status === "queued") {
    return task.totalBytes !== null ? formatBytes(task.totalBytes) : `等待${action}`;
  }
  if (task.status === "retrying") {
    if (now === 0) {
      return "等待自动重试";
    }
    const waitSeconds = Math.max(
      0,
      Math.ceil(((task.nextRetryAt ?? now) - now) / 1_000),
    );
    return `${formatDuration(waitSeconds)}后重试`;
  }
  if (task.status === "paused") {
    const total = task.totalBytes;
    return total === null
      ? `已暂停${action}`
      : `${formatBytes(task.transferredBytes)} / ${formatBytes(total)} · 已暂停`;
  }
  if (task.status === "failed") {
    return `已${action} ${formatBytes(task.transferredBytes)}`;
  }
  if (task.status === "cancelled") {
    return `已${action} ${formatBytes(task.transferredBytes)}`;
  }
  if (task.status === "completed") {
    return `${formatBytes(task.totalBytes ?? task.transferredBytes)} · ${action}完成`;
  }
  if (task.totalBytes === null) {
    return `正在准备${action}`;
  }

  const speed =
    task.bytesPerSecond > 0 ? `${formatBytes(task.bytesPerSecond)}/s` : "估算中";
  const etaSeconds = getTransferEtaSeconds(task);
  const eta = etaSeconds === null ? "" : ` · 剩 ${formatDuration(etaSeconds)}`;
  return `${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)} · ${speed}${eta}`;
}

type QueueSummaryInput = {
  uploadCount: number;
  downloadCount: number;
  runningCount: number;
  pausedCount: number;
  concurrencyLimit: number;
  pendingCount: number;
  queueEtaSeconds: number | null;
};

function formatQueueSummary({
  uploadCount,
  downloadCount,
  runningCount,
  pausedCount,
  concurrencyLimit,
  pendingCount,
  queueEtaSeconds,
}: QueueSummaryInput) {
  const counts = `上传 ${uploadCount} · 下载 ${downloadCount}`;
  if (pendingCount === 0) {
    return pausedCount > 0
      ? `${counts} · 已暂停 ${pausedCount}`
      : `${counts} · 暂无进行中的任务`;
  }

  const eta =
    queueEtaSeconds === null
      ? "队列剩余估算中"
      : `队列剩约 ${formatDuration(queueEtaSeconds)}`;
  const paused = pausedCount > 0 ? ` · 暂停 ${pausedCount}` : "";
  return `${counts} · 并发 ${runningCount}/${concurrencyLimit}${paused} · ${eta}`;
}

function getTransferPercentage(task: FileTransferTask) {
  if (task.totalBytes === null) {
    return null;
  }
  if (task.totalBytes === 0) {
    return 100;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((task.transferredBytes / task.totalBytes) * 100)),
  );
}

function formatTriggerLabel(
  runningCount: number,
  waitingCount: number,
  pausedCount: number,
  failedCount: number,
) {
  return `传输任务，${runningCount} 个进行中，${waitingCount} 个等待，${pausedCount} 个暂停，${failedCount} 个失败`;
}

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return "0 秒";
  }
  if (seconds < 60) {
    return `${Math.max(1, Math.ceil(seconds))} 秒`;
  }
  if (seconds < 3_600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);
    return remainingSeconds > 0
      ? `${minutes} 分 ${remainingSeconds} 秒`
      : `${minutes} 分`;
  }

  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.ceil((seconds % 3_600) / 60);
  return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
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

function useRetryClock(isEnabled: boolean) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const updateNow = () => setNow(Date.now());
    const timeout = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 1_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [isEnabled]);

  return now;
}
