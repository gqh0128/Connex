import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { CircleAlert, CircleStop, LoaderCircle, ShieldQuestion } from "lucide-react";
import { useEffect, useRef } from "react";

import { useTheme } from "@/app/useTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getSessionPresentation } from "../sessionPresentation";
import type {
  SessionOutputHandler,
  SshSessionTab,
  TerminalDimensions,
} from "../sessionTypes";
import { createTerminalTheme, getCurrentResolvedTheme } from "../terminalTheme";

const INPUT_FLUSH_DELAY_MS = 8;
const INPUT_FLUSH_SIZE_BYTES = 4 * 1024;
const RESIZE_DEBOUNCE_MS = 60;

type TerminalPaneProps = {
  tab: SshSessionTab;
  isActive: boolean;
  isWorkspaceVisible: boolean;
  onStart: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onRegisterOutput: (localId: string, handler: SessionOutputHandler) => () => void;
  onInput: (localId: string, data: Uint8Array) => Promise<void>;
  onResize: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onClose: (localId: string) => void;
};

export function TerminalPane({
  tab,
  isActive,
  isWorkspaceVisible,
  onStart,
  onRegisterOutput,
  onInput,
  onResize,
  onClose,
}: TerminalPaneProps) {
  const { resolvedTheme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const isVisible = isActive && isWorkspaceVisible;
  const presentation = getSessionPresentation(tab);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      disableStdin: true,
      drawBoldTextInBrightColors: true,
      fontFamily: getComputedStyle(document.documentElement)
        .getPropertyValue("--font-terminal")
        .trim(),
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10_000,
      smoothScrollDuration: 100,
      theme: createTerminalTheme(getCurrentResolvedTheme()),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;

    let fitAnimationFrame: number | null = null;
    let resizeTimer: number | null = null;
    let inputTimer: number | null = null;
    let inputChunks: Uint8Array[] = [];
    let inputBytes = 0;
    let inputChain = Promise.resolve();
    const encoder = new TextEncoder();

    const dimensions = (): TerminalDimensions => {
      const bounds = host.getBoundingClientRect();
      return {
        columns: terminal.cols,
        rows: terminal.rows,
        pixelWidth: Math.max(1, Math.round(bounds.width)),
        pixelHeight: Math.max(1, Math.round(bounds.height)),
      };
    };

    const flushInput = () => {
      if (inputTimer !== null) {
        window.clearTimeout(inputTimer);
        inputTimer = null;
      }
      if (inputBytes === 0) {
        return;
      }

      const payload = new Uint8Array(inputBytes);
      let offset = 0;
      for (const chunk of inputChunks) {
        payload.set(chunk, offset);
        offset += chunk.byteLength;
      }
      inputChunks = [];
      inputBytes = 0;
      inputChain = inputChain
        .then(() => onInput(tab.localId, payload))
        .catch(() => undefined);
    };

    const fitAndStart = () => {
      if (
        host.dataset.visible === "true" &&
        host.clientWidth > 0 &&
        host.clientHeight > 0
      ) {
        fitAddon.fit();
      }

      void onStart(tab.localId, dimensions());
    };

    const scheduleFit = () => {
      if (fitAnimationFrame !== null) {
        window.cancelAnimationFrame(fitAnimationFrame);
      }
      fitAnimationFrame = window.requestAnimationFrame(() => {
        fitAnimationFrame = null;
        fitAndStart();
      });
    };

    fitRef.current = scheduleFit;
    const unregisterOutput = onRegisterOutput(tab.localId, (data) => {
      terminal.write(data);
    });
    const inputDisposable = terminal.onData((data) => {
      const chunk = encoder.encode(data);
      inputChunks.push(chunk);
      inputBytes += chunk.byteLength;

      if (inputBytes >= INPUT_FLUSH_SIZE_BYTES) {
        flushInput();
      } else if (inputTimer === null) {
        inputTimer = window.setTimeout(flushInput, INPUT_FLUSH_DELAY_MS);
      }
    });
    const resizeDisposable = terminal.onResize(() => {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        void onResize(tab.localId, dimensions()).catch(() => undefined);
      }, RESIZE_DEBOUNCE_MS);
    });
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(host);
    scheduleFit();

    return () => {
      flushInput();
      unregisterOutput();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      if (fitAnimationFrame !== null) {
        window.cancelAnimationFrame(fitAnimationFrame);
      }
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      if (inputTimer !== null) {
        window.clearTimeout(inputTimer);
      }
      if (fitRef.current === scheduleFit) {
        fitRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [onInput, onRegisterOutput, onResize, onStart, tab.localId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = createTerminalTheme(resolvedTheme);
    fitRef.current?.();
  }, [resolvedTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !isVisible) {
      return;
    }

    fitRef.current?.();
    terminal.focus();
  }, [isVisible]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = tab.snapshot?.state !== "connected";
    }
  }, [tab.snapshot?.state]);

  return (
    <div
      id={`terminal-${tab.localId}`}
      role="tabpanel"
      aria-label={`${tab.profile.name} 终端`}
      aria-hidden={!isVisible}
      className={cn(
        "absolute inset-0 bg-terminal",
        isVisible ? "visible" : "invisible pointer-events-none",
      )}
    >
      <div className="h-full min-h-0 p-3">
        <div
          ref={hostRef}
          data-visible={isVisible}
          className="connex-terminal h-full min-h-0 w-full overflow-hidden"
        />
      </div>

      {tab.snapshot?.state === "connected" ? null : (
        <SessionStateNotice
          presentation={presentation}
          canClose={
            Boolean(tab.startError) ||
            tab.snapshot?.state === "closed" ||
            tab.snapshot?.state === "disconnected" ||
            tab.snapshot?.state === "error"
          }
          onClose={() => onClose(tab.localId)}
        />
      )}
    </div>
  );
}

type SessionStateNoticeProps = {
  presentation: ReturnType<typeof getSessionPresentation>;
  canClose: boolean;
  onClose: () => void;
};

function SessionStateNotice({
  presentation,
  canClose,
  onClose,
}: SessionStateNoticeProps) {
  const Icon = presentation.isBusy
    ? LoaderCircle
    : presentation.tone === "warning"
      ? ShieldQuestion
      : presentation.tone === "error"
        ? CircleAlert
        : CircleStop;

  return (
    <div
      aria-live="polite"
      className="absolute top-3 right-4 z-10 flex max-w-sm items-start gap-3 rounded-lg border bg-surface/95 p-3 shadow-lg backdrop-blur-sm"
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          presentation.isBusy && "animate-spin text-info",
          presentation.tone === "warning" && "text-warning",
          presentation.tone === "error" && "text-destructive",
          presentation.tone === "muted" && "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{presentation.label}</p>
        {presentation.detail ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {presentation.detail}
          </p>
        ) : null}
      </div>
      {canClose ? (
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      ) : null}
    </div>
  );
}
