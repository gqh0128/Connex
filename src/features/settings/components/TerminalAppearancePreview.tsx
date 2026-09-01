import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import { useTheme } from "@/app/useTheme";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "@/components/ui/field";
import {
  createTerminalTheme,
  getTerminalSemanticPalette,
} from "@/features/terminal/terminalTheme";
import type { TerminalThemeProfileId } from "@/features/terminal/terminalThemeProfiles";

type TerminalAppearancePreviewProps = {
  themeProfileId: TerminalThemeProfileId;
  fontFamily: string;
  fontWeight: number;
  fontWeightBold: number;
  fontSize: number;
  lineHeight: number;
};

export function TerminalAppearancePreview({
  themeProfileId,
  fontFamily,
  fontWeight,
  fontWeightBold,
  fontSize,
  lineHeight,
}: TerminalAppearancePreviewProps) {
  const { resolvedTheme, colorSchemeId } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const initialAppearanceRef = useRef({
    resolvedTheme,
    themeProfileId,
    fontFamily,
    fontWeight,
    fontWeightBold,
    fontSize,
    lineHeight,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const initialAppearance = initialAppearanceRef.current;
    const terminal = new Terminal({
      cursorBlink: false,
      cursorInactiveStyle: "none",
      disableStdin: true,
      fontFamily: initialAppearance.fontFamily,
      fontWeight: initialAppearance.fontWeight,
      fontWeightBold: initialAppearance.fontWeightBold,
      fontSize: initialAppearance.fontSize,
      lineHeight: initialAppearance.lineHeight,
      scrollback: 0,
      theme: createTerminalTheme(
        initialAppearance.resolvedTheme,
        initialAppearance.themeProfileId,
      ),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;

    let fitAnimationFrame: number | null = null;
    const scheduleFit = () => {
      if (fitAnimationFrame !== null) {
        window.cancelAnimationFrame(fitAnimationFrame);
      }
      fitAnimationFrame = window.requestAnimationFrame(() => {
        fitAnimationFrame = null;
        if (host.clientWidth > 0 && host.clientHeight > 0) {
          fitAddon.fit();
        }
      });
    };
    fitRef.current = scheduleFit;

    terminal.write(
      createPreviewContent(
        getTerminalSemanticPalette(
          initialAppearance.resolvedTheme,
          initialAppearance.themeProfileId,
        ),
      ),
    );
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(host);
    scheduleFit();

    return () => {
      resizeObserver.disconnect();
      if (fitAnimationFrame !== null) {
        window.cancelAnimationFrame(fitAnimationFrame);
      }
      if (fitRef.current === scheduleFit) {
        fitRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.fontFamily = fontFamily;
    terminal.options.fontWeight = fontWeight;
    terminal.options.fontWeightBold = fontWeightBold;
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = lineHeight;
    terminal.options.theme = createTerminalTheme(resolvedTheme, themeProfileId);
    terminal.write(
      `\x1bc${createPreviewContent(
        getTerminalSemanticPalette(resolvedTheme, themeProfileId),
      )}`,
    );
    terminal.refresh(0, terminal.rows - 1);
    fitRef.current?.();
  }, [
    fontFamily,
    fontSize,
    fontWeight,
    fontWeightBold,
    lineHeight,
    colorSchemeId,
    resolvedTheme,
    themeProfileId,
  ]);

  return (
    <Field className="p-4">
      <FieldContent>
        <FieldTitle>终端预览</FieldTitle>
        <FieldDescription>
          字体、字重、字号、行距和当前终端配色会实时应用到这里。
        </FieldDescription>
      </FieldContent>
      <div
        aria-hidden="true"
        inert
        className="overflow-hidden rounded-md border bg-terminal p-3"
      >
        <div ref={hostRef} className="connex-terminal h-36 min-h-0 w-full" />
      </div>
    </Field>
  );
}

type PreviewPalette = ReturnType<typeof getTerminalSemanticPalette>;

function createPreviewContent(palette: PreviewPalette) {
  const url = ansiForeground(palette.url);
  const option = ansiForeground(palette.option);
  const path = ansiForeground(palette.path);
  const host = ansiForeground(palette.host);
  const reset = "\x1b[0m";

  return [
    "\x1b[1mWelcome to Ubuntu 22.04.4 LTS\x1b[22m (GNU/Linux 6.8.0 x86_64)",
    "",
    ` * Documentation:  ${url}https://help.ubuntu.com${reset}`,
    ` * Management:     ${url}https://landscape.canonical.com${reset}`,
    `${host}deploy@prod-web-01${reset}:${path}~${reset}$ pnpm build ${option}--production${reset}`,
    "> connex@0.1.0 build",
    `${host}✓${reset} 2017 modules transformed · completed in 2.31s`,
  ].join("\r\n");
}

function ansiForeground(color: string) {
  const match = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu);
  if (!match) {
    return "\x1b[39m";
  }
  const red = Number.parseInt(match[1], 16);
  const green = Number.parseInt(match[2], 16);
  const blue = Number.parseInt(match[3], 16);
  return `\x1b[38;2;${red};${green};${blue}m`;
}
