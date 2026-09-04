import { ArrowRight, FileInput } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type {
  SessionOutputHandler,
  SshSessionTab,
  TerminalDimensions,
} from "@/features/terminal/sessionTypes";
import type { TerminalThemeProfileId } from "@/features/terminal/terminalThemeProfiles";
import { getPrimaryShortcutModifierLabel } from "@/lib/platform";

import { TerminalPane } from "./TerminalPane";

type TerminalWorkspaceProps = {
  tabs: SshSessionTab[];
  activeTabId: string | null;
  isWorkspaceVisible: boolean;
  themeProfileId: TerminalThemeProfileId;
  isSemanticHighlightingEnabled: boolean;
  fontFamily: string;
  fontWeight: number;
  fontWeightBold: number;
  fontSize: number;
  lineHeight: number;
  isFontSizeShortcutsEnabled: boolean;
  onFontSizeChange: (fontSize: number) => Promise<number>;
  onNewConnection: () => void;
  onImportSshConfig: () => void;
  onStart: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onRegisterOutput: (localId: string, handler: SessionOutputHandler) => () => void;
  onInput: (localId: string, data: Uint8Array) => Promise<void>;
  onResize: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onReconnect: (localId: string) => void;
  onClose: (localId: string) => void;
};

export function TerminalWorkspace({
  tabs,
  activeTabId,
  isWorkspaceVisible,
  themeProfileId,
  isSemanticHighlightingEnabled,
  fontFamily,
  fontWeight,
  fontWeightBold,
  fontSize,
  lineHeight,
  isFontSizeShortcutsEnabled,
  onFontSizeChange,
  onNewConnection,
  onImportSshConfig,
  onStart,
  onRegisterOutput,
  onInput,
  onResize,
  onReconnect,
  onClose,
}: TerminalWorkspaceProps) {
  const shortcutModifier = getPrimaryShortcutModifierLabel();

  return (
    <section className="relative h-full min-h-0 min-w-0 overflow-hidden bg-terminal">
      {tabs.length === 0 ? (
        <Empty className="h-full">
          <EmptyHeader className="max-w-md gap-3">
            <EmptyTitle role="heading" aria-level={1}>
              开始一个远程会话
            </EmptyTitle>
            <EmptyDescription className="max-w-md">
              连接服务器后，终端、远程文件和传输任务会在这个工作区协同展开。
            </EmptyDescription>
          </EmptyHeader>

          <EmptyContent className="gap-3">
            <div className="flex items-center justify-center gap-2">
              <Button type="button" onClick={onNewConnection}>
                新建 SSH 连接
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button type="button" variant="outline" onClick={onImportSshConfig}>
                <FileInput data-icon="inline-start" />
                导入 SSH config
              </Button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <span>也可以按</span>
              <kbd className="rounded border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
                {shortcutModifier} N
              </kbd>
              <span>快速新建</span>
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
          themeProfileId={themeProfileId}
          isSemanticHighlightingEnabled={isSemanticHighlightingEnabled}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontWeightBold={fontWeightBold}
          fontSize={fontSize}
          lineHeight={lineHeight}
          isFontSizeShortcutsEnabled={isFontSizeShortcutsEnabled}
          onFontSizeChange={onFontSizeChange}
          onStart={onStart}
          onRegisterOutput={onRegisterOutput}
          onInput={onInput}
          onResize={onResize}
          onReconnect={onReconnect}
          onClose={onClose}
        />
      ))}
    </section>
  );
}
