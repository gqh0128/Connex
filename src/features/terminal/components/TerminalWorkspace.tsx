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
import type {
  SessionOutputHandler,
  SshSessionTab,
  TerminalDimensions,
} from "@/features/terminal/sessionTypes";

import { TerminalPane } from "./TerminalPane";

type TerminalWorkspaceProps = {
  tabs: SshSessionTab[];
  activeTabId: string | null;
  isWorkspaceVisible: boolean;
  onNewConnection: () => void;
  onStart: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onRegisterOutput: (localId: string, handler: SessionOutputHandler) => () => void;
  onInput: (localId: string, data: Uint8Array) => Promise<void>;
  onResize: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onClose: (localId: string) => void;
};

export function TerminalWorkspace({
  tabs,
  activeTabId,
  isWorkspaceVisible,
  onNewConnection,
  onStart,
  onRegisterOutput,
  onInput,
  onResize,
  onClose,
}: TerminalWorkspaceProps) {
  return (
    <section className="relative h-full min-h-0 min-w-0 overflow-hidden bg-terminal">
      {tabs.length === 0 ? (
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
            <Button type="button" onClick={onNewConnection}>
              新建连接
              <ArrowRight data-icon="inline-end" />
            </Button>
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
      ) : null}

      {tabs.map((tab) => (
        <TerminalPane
          key={tab.localId}
          tab={tab}
          isActive={tab.localId === activeTabId}
          isWorkspaceVisible={isWorkspaceVisible}
          onStart={onStart}
          onRegisterOutput={onRegisterOutput}
          onInput={onInput}
          onResize={onResize}
          onClose={onClose}
        />
      ))}
    </section>
  );
}
