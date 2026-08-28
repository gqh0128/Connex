import { ArrowDownToLine, ChevronDown, ChevronUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

type TransferDrawerProps = {
  isExpanded: boolean;
  onToggle: () => void;
};

export function TransferDrawer({ isExpanded, onToggle }: TransferDrawerProps) {
  return (
    <section className="flex h-full min-h-8 flex-col bg-surface" aria-label="传输队列">
      <header className="flex h-8 shrink-0 items-center gap-2 px-3">
        <ArrowDownToLine className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">传输</span>
        <Badge variant="secondary">0</Badge>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          暂无活动任务
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={isExpanded ? "收起传输队列" : "展开传输队列"}
          onClick={onToggle}
        >
          {isExpanded ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </header>

      {isExpanded ? (
        <Empty className="min-h-0 rounded-none border-t p-4">
          <EmptyHeader>
            <EmptyTitle>暂无传输任务</EmptyTitle>
            <EmptyDescription>上传或下载文件后，进度会显示在这里。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  );
}
