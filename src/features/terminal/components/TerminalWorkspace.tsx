import { ArrowRight, Command } from "lucide-react";

import { ConnexMark } from "@/components/brand/ConnexMark";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function TerminalWorkspace() {
  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden bg-terminal">
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia>
            <ConnexMark size="large" />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>
            连接你的第一台服务器
          </EmptyTitle>
          <EmptyDescription>
            创建一个 SSH 连接，终端会话和远程文件将在同一个工作区中打开。
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button">
              新建连接
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button type="button" variant="outline">
              导入 SSH 配置
            </Button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Command className="size-3" />
            <span>按</span>
            <kbd className="rounded border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
              ⌘ N
            </kbd>
            <span>新建连接</span>
          </div>
        </EmptyContent>
      </Empty>
    </section>
  );
}
