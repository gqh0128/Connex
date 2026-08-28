import { ArrowDownToLine, ArrowUpDown, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";

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

const TRANSFER_SUMMARY = [
  { label: "上传", value: 0, icon: ArrowUpFromLine },
  { label: "下载", value: 0, icon: ArrowDownToLine },
] as const;

export function TransferPopover() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={isOpen ? "secondary" : "ghost"}
              size="icon"
              aria-label="传输任务，0 个活动任务"
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
            <Badge variant="secondary">0 个活动</Badge>
          </div>
        </PopoverHeader>

        <Separator />
        <div className="grid grid-cols-2 px-4 py-3">
          {TRANSFER_SUMMARY.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{value}</span>
            </div>
          ))}
        </div>
        <Separator />

        <ScrollArea className="min-h-0">
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
