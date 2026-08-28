import { ArrowRight, Command, KeyRound, Server } from "lucide-react";

import { ConnexMark } from "@/components/brand/ConnexMark";
import { Button } from "@/components/ui/button";

export function TerminalWorkspace() {
  return (
    <section className="relative min-h-0 min-w-0 overflow-hidden bg-terminal font-mono">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_32rem)]"
      />

      <div className="relative flex h-full items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <ConnexMark className="mx-auto mb-5 size-11 rounded-xl [&_svg]:size-5" />
          <h1 className="font-sans text-lg font-semibold tracking-tight text-foreground">
            连接你的第一台服务器
          </h1>
          <p className="mx-auto mt-2 max-w-sm font-sans text-sm leading-6 text-muted-foreground">
            创建一个 SSH 连接，终端会话和远程文件将在同一个工作区中打开。
          </p>

          <div className="mt-6 flex justify-center gap-2 font-sans">
            <Button type="button">
              新建连接
              <ArrowRight />
            </Button>
            <Button type="button" variant="outline">
              导入 SSH 配置
            </Button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-2 font-sans text-left">
            <Hint icon={Server} title="连接管理" text="保存并快速打开常用主机" />
            <Hint icon={KeyRound} title="安全认证" text="密码、私钥与 SSH Agent" />
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 font-sans text-[11px] text-muted-foreground/70">
            <Command className="size-3" />
            <span>按</span>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘ N
            </kbd>
            <span>新建连接</span>
          </div>
        </div>
      </div>
    </section>
  );
}

type HintProps = {
  icon: typeof Server;
  title: string;
  text: string;
};

function Hint({ icon: Icon, title, text }: HintProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface/50 p-3">
      <Icon className="mb-2 size-4 text-primary" />
      <div className="text-xs font-medium text-foreground/90">{title}</div>
      <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{text}</div>
    </div>
  );
}
