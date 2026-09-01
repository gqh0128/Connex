import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  CircleAlert,
  CircleStop,
  ClipboardPaste,
  Copy,
  Eraser,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldQuestion,
  TextSelect,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/app/useTheme";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  canReadClipboardText,
  canWriteClipboardText,
  readClipboardText,
  writeClipboardText,
} from "@/lib/clipboard";
import {
  getPrimaryShortcutModifierLabel,
  hasPrimaryShortcutModifier,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

import { getSessionPresentation } from "../sessionPresentation";
import type {
  SessionOutputHandler,
  SshSessionTab,
  TerminalDimensions,
} from "../sessionTypes";
import { registerTerminalLinks } from "../terminalLinks";
import {
  adjustTerminalFontSize,
  getTerminalFontSizeShortcut,
} from "../terminalFontSize";
import { isTerminalSystemModifierOnlyEvent } from "../terminalKeyEvents";
import { normalizeTerminalLineHeight } from "../terminalLineHeight";
import { TerminalSemanticHighlighter } from "../terminalSemanticHighlighter";
import {
  EMPTY_TERMINAL_SEARCH_RESULT,
  formatTerminalSearchResult,
  TerminalSearchController,
  type TerminalSearchDirection,
} from "../terminalSearch";
import {
  createTerminalTheme,
  getCurrentResolvedTheme,
  getTerminalSemanticPalette,
  getTerminalSearchDecorations,
} from "../terminalTheme";
import type { TerminalThemeProfileId } from "../terminalThemeProfiles";
import { TerminalSearchBar } from "./TerminalSearchBar";

const INPUT_FLUSH_DELAY_MS = 8;
const INPUT_FLUSH_SIZE_BYTES = 4 * 1024;
const RESIZE_DEBOUNCE_MS = 60;

function applyFontSize(terminal: Terminal, fontSize: number, fit: () => void) {
  if (terminal.options.fontSize === fontSize) {
    return;
  }
  terminal.options.fontSize = fontSize;
  terminal.refresh(0, terminal.rows - 1);
  fit();
}

function applyLineHeight(terminal: Terminal, lineHeight: number, fit: () => void) {
  const nextLineHeight = normalizeTerminalLineHeight(lineHeight);
  if (terminal.options.lineHeight === nextLineHeight) {
    return;
  }
  terminal.options.lineHeight = nextLineHeight;
  terminal.refresh(0, terminal.rows - 1);
  fit();
}

type TerminalPaneProps = {
  tab: SshSessionTab;
  isActive: boolean;
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
  onStart: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onRegisterOutput: (localId: string, handler: SessionOutputHandler) => () => void;
  onInput: (localId: string, data: Uint8Array) => Promise<void>;
  onResize: (localId: string, dimensions: TerminalDimensions) => Promise<void>;
  onReconnect: (localId: string) => void;
  onClose: (localId: string) => void;
};

export function TerminalPane({
  tab,
  isActive,
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
  onStart,
  onRegisterOutput,
  onInput,
  onResize,
  onReconnect,
  onClose,
}: TerminalPaneProps) {
  const { resolvedTheme, colorSchemeId } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const searchControllerRef = useRef<TerminalSearchController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearchOpenRef = useRef(false);
  const semanticHighlighterRef = useRef<TerminalSemanticHighlighter | null>(null);
  const appearanceRef = useRef({
    themeProfileId,
    isSemanticHighlightingEnabled,
    fontFamily,
    fontWeight,
    fontWeightBold,
    fontSize,
    lineHeight,
    isFontSizeShortcutsEnabled,
  });
  const fontSizeChangeRef = useRef(onFontSizeChange);
  const persistedFontSizeRef = useRef(fontSize);
  const fontSizeRequestRef = useRef({ version: 0, isPending: false });
  const fitRef = useRef<(() => void) | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchCaseSensitive, setIsSearchCaseSensitive] = useState(false);
  const [searchResult, setSearchResult] = useState(EMPTY_TERMINAL_SEARCH_RESULT);
  const isVisible = isActive && isWorkspaceVisible;
  const presentation = getSessionPresentation(tab);
  const shortcutModifier = getPrimaryShortcutModifierLabel();

  const openSearch = () => {
    setIsSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    searchControllerRef.current?.clear();
    setSearchResult(EMPTY_TERMINAL_SEARCH_RESULT);
    window.requestAnimationFrame(() => terminalRef.current?.focus());
  };

  const navigateSearch = (direction: TerminalSearchDirection) => {
    searchControllerRef.current?.find(searchQuery, direction);
  };

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    appearanceRef.current.themeProfileId = themeProfileId;
    appearanceRef.current.isSemanticHighlightingEnabled = isSemanticHighlightingEnabled;
    appearanceRef.current.fontFamily = fontFamily;
    appearanceRef.current.fontWeight = fontWeight;
    appearanceRef.current.fontWeightBold = fontWeightBold;
    appearanceRef.current.lineHeight = lineHeight;
    appearanceRef.current.isFontSizeShortcutsEnabled = isFontSizeShortcutsEnabled;
    fontSizeChangeRef.current = onFontSizeChange;
  }, [
    fontFamily,
    fontWeight,
    fontWeightBold,
    isFontSizeShortcutsEnabled,
    isSemanticHighlightingEnabled,
    onFontSizeChange,
    themeProfileId,
    lineHeight,
  ]);

  useEffect(() => {
    persistedFontSizeRef.current = fontSize;
    if (!fontSizeRequestRef.current.isPending) {
      appearanceRef.current.fontSize = fontSize;
    }
  }, [fontSize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      disableStdin: true,
      drawBoldTextInBrightColors: true,
      fontFamily: appearanceRef.current.fontFamily,
      fontWeight: appearanceRef.current.fontWeight,
      fontWeightBold: appearanceRef.current.fontWeightBold,
      fontSize: appearanceRef.current.fontSize,
      lineHeight: appearanceRef.current.lineHeight,
      scrollback: 10_000,
      smoothScrollDuration: 100,
      overviewRuler: { width: 6 },
      theme: createTerminalTheme(
        getCurrentResolvedTheme(),
        appearanceRef.current.themeProfileId,
      ),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    const searchController = new TerminalSearchController(
      terminal,
      getTerminalSearchDecorations(
        getCurrentResolvedTheme(),
        appearanceRef.current.themeProfileId,
      ),
      setSearchResult,
    );
    searchControllerRef.current = searchController;
    const terminalLinks = registerTerminalLinks(terminal, host);
    const semanticHighlighter = new TerminalSemanticHighlighter(
      terminal,
      getTerminalSemanticPalette(
        getCurrentResolvedTheme(),
        appearanceRef.current.themeProfileId,
      ),
      appearanceRef.current.isSemanticHighlightingEnabled,
    );
    semanticHighlighterRef.current = semanticHighlighter;

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

    terminal.attachCustomKeyEventHandler((event) => {
      if (isTerminalSystemModifierOnlyEvent(event)) {
        return false;
      }

      if (hasPrimaryShortcutModifier(event) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "keydown" && !event.repeat) {
          setIsSearchOpen(true);
          window.requestAnimationFrame(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          });
        }
        return false;
      }

      if (event.key === "Escape" && isSearchOpenRef.current) {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "keydown") {
          setIsSearchOpen(false);
          searchController.clear();
          setSearchResult(EMPTY_TERMINAL_SEARCH_RESULT);
        }
        return false;
      }

      const direction = getTerminalFontSizeShortcut(event);
      if (!appearanceRef.current.isFontSizeShortcutsEnabled || !direction) {
        return true;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.type !== "keydown" || event.repeat) {
        return false;
      }

      const nextFontSize = adjustTerminalFontSize(
        appearanceRef.current.fontSize,
        direction,
      );
      if (nextFontSize === appearanceRef.current.fontSize) {
        return false;
      }

      appearanceRef.current.fontSize = nextFontSize;
      applyFontSize(terminal, nextFontSize, scheduleFit);
      const requestVersion = fontSizeRequestRef.current.version + 1;
      fontSizeRequestRef.current = {
        version: requestVersion,
        isPending: true,
      };
      void fontSizeChangeRef
        .current(nextFontSize)
        .then((savedFontSize) => {
          if (fontSizeRequestRef.current.version !== requestVersion) {
            return;
          }
          fontSizeRequestRef.current.isPending = false;
          persistedFontSizeRef.current = savedFontSize;
          appearanceRef.current.fontSize = savedFontSize;
          if (terminalRef.current === terminal) {
            applyFontSize(terminal, savedFontSize, scheduleFit);
          }
        })
        .catch(() => {
          if (fontSizeRequestRef.current.version !== requestVersion) {
            return;
          }
          fontSizeRequestRef.current.isPending = false;
          const persistedFontSize = persistedFontSizeRef.current;
          appearanceRef.current.fontSize = persistedFontSize;
          if (terminalRef.current === terminal) {
            applyFontSize(terminal, persistedFontSize, scheduleFit);
          }
        });
      return false;
    });

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
      terminalLinks.dispose();
      semanticHighlighter.dispose();
      if (semanticHighlighterRef.current === semanticHighlighter) {
        semanticHighlighterRef.current = null;
      }
      searchController.dispose();
      if (searchControllerRef.current === searchController) {
        searchControllerRef.current = null;
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

    terminal.options.theme = createTerminalTheme(resolvedTheme, themeProfileId);
    semanticHighlighterRef.current?.setPalette(
      getTerminalSemanticPalette(resolvedTheme, themeProfileId),
    );
    fitRef.current?.();
  }, [colorSchemeId, resolvedTheme, themeProfileId]);

  useEffect(() => {
    searchControllerRef.current?.setDecorations(
      getTerminalSearchDecorations(resolvedTheme, themeProfileId),
    );
  }, [resolvedTheme, themeProfileId]);

  useEffect(() => {
    const searchController = searchControllerRef.current;
    if (!searchController) {
      return;
    }

    searchController.setCaseSensitive(isSearchCaseSensitive);

    if (!isSearchOpen || !searchQuery) {
      searchController.clear();
      return;
    }

    searchController.find(searchQuery, "next", true);
  }, [isSearchCaseSensitive, isSearchOpen, searchQuery]);

  useEffect(() => {
    semanticHighlighterRef.current?.setEnabled(isSemanticHighlightingEnabled);
  }, [isSemanticHighlightingEnabled]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (
      !terminal ||
      (terminal.options.fontFamily === fontFamily &&
        terminal.options.fontWeight === fontWeight &&
        terminal.options.fontWeightBold === fontWeightBold)
    ) {
      return;
    }
    terminal.options.fontFamily = fontFamily;
    terminal.options.fontWeight = fontWeight;
    terminal.options.fontWeightBold = fontWeightBold;
    terminal.refresh(0, terminal.rows - 1);
    fitRef.current?.();
  }, [fontFamily, fontWeight, fontWeightBold]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || fontSizeRequestRef.current.isPending) {
      return;
    }
    appearanceRef.current.fontSize = fontSize;
    applyFontSize(terminal, fontSize, () => fitRef.current?.());
  }, [fontSize]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    applyLineHeight(terminal, lineHeight, () => fitRef.current?.());
  }, [lineHeight]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !isVisible) {
      return;
    }

    fitRef.current?.();
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    } else {
      terminal.focus();
    }
  }, [isSearchOpen, isVisible]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = tab.snapshot?.state !== "connected";
    }
  }, [tab.snapshot?.state]);

  const copySelection = () => {
    const selection = terminalRef.current?.getSelection() ?? "";
    if (selection) {
      void writeClipboardText(selection).catch(() => undefined);
    }
  };

  const pasteClipboard = () => {
    void readClipboardText()
      .then((value) => {
        if (value) {
          terminalRef.current?.paste(value);
        }
      })
      .catch(() => undefined);
  };

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
      <ContextMenu
        onOpenChange={(isOpen) => {
          if (isOpen) {
            setHasSelection(terminalRef.current?.hasSelection() ?? false);
          }
        }}
      >
        <ContextMenuTrigger asChild>
          <div className="h-full min-h-0 p-3">
            <div
              ref={hostRef}
              data-visible={isVisible}
              className="connex-terminal relative h-full min-h-0 w-full overflow-hidden"
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            terminalRef.current?.focus();
          }}
        >
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={!hasSelection || !canWriteClipboardText()}
              onSelect={copySelection}
            >
              <Copy />
              复制
              <ContextMenuShortcut>{shortcutModifier}C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={tab.snapshot?.state !== "connected" || !canReadClipboardText()}
              onSelect={pasteClipboard}
            >
              <ClipboardPaste />
              粘贴
              <ContextMenuShortcut>{shortcutModifier}V</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => terminalRef.current?.selectAll()}>
              <TextSelect />
              全选
              <ContextMenuShortcut>{shortcutModifier}A</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem onSelect={openSearch}>
              <Search />
              查找
              <ContextMenuShortcut>{shortcutModifier}F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => terminalRef.current?.clear()}>
              <Eraser />
              清屏
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>

      {isSearchOpen ? (
        <TerminalSearchBar
          inputRef={searchInputRef}
          query={searchQuery}
          resultLabel={formatTerminalSearchResult(searchQuery, searchResult)}
          isCaseSensitive={isSearchCaseSensitive}
          canNavigate={searchQuery.length > 0 && searchResult.resultCount > 0}
          onQueryChange={(query) => {
            setSearchQuery(query);
            if (!query) {
              setSearchResult(EMPTY_TERMINAL_SEARCH_RESULT);
            }
          }}
          onCaseSensitiveChange={setIsSearchCaseSensitive}
          onNavigate={navigateSearch}
          onInputBlur={() => searchControllerRef.current?.clearActiveDecoration()}
          onClose={closeSearch}
        />
      ) : null}

      {tab.snapshot?.state === "connected" ? null : (
        <SessionStateNotice
          presentation={presentation}
          canReconnect={
            Boolean(tab.startError) ||
            tab.snapshot?.state === "closed" ||
            tab.snapshot?.state === "disconnected" ||
            tab.snapshot?.state === "error"
          }
          canClose={
            Boolean(tab.startError) ||
            tab.snapshot?.state === "closed" ||
            tab.snapshot?.state === "disconnected" ||
            tab.snapshot?.state === "error"
          }
          onReconnect={() => onReconnect(tab.localId)}
          onClose={() => onClose(tab.localId)}
        />
      )}
    </div>
  );
}

type SessionStateNoticeProps = {
  presentation: ReturnType<typeof getSessionPresentation>;
  canReconnect: boolean;
  canClose: boolean;
  onReconnect: () => void;
  onClose: () => void;
};

function SessionStateNotice({
  presentation,
  canReconnect,
  canClose,
  onReconnect,
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
      className="absolute top-3 right-4 z-10 flex max-w-md items-start gap-3 rounded-lg border bg-surface/95 p-3 shadow-lg backdrop-blur-sm"
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
      {canReconnect || canClose ? (
        <div className="flex shrink-0 items-center gap-2">
          {canReconnect ? (
            <Button type="button" size="sm" onClick={onReconnect}>
              <RefreshCw data-icon="inline-start" />
              重新连接
            </Button>
          ) : null}
          {canClose ? (
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              关闭标签
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
