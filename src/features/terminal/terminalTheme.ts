import type { ITheme } from "@xterm/xterm";

import type { ResolvedTheme } from "@/app/theme";
import {
  DEFAULT_TERMINAL_THEME_PROFILE_ID,
  getTerminalThemeProfile,
  type TerminalSemanticPalette,
  type TerminalThemeProfileId,
} from "./terminalThemeProfiles";

const FALLBACKS = {
  light: {
    background: "#FCFCFD",
    foreground: "#25262B",
    cursor: "#20A66A",
    cursorAccent: "#FCFCFD",
    muted: "#70727A",
  },
  dark: {
    background: "#111318",
    foreground: "#E8E9ED",
    cursor: "#48D597",
    cursorAccent: "#111318",
    muted: "#9B9DA5",
  },
} as const;

export function createTerminalTheme(
  resolvedTheme: ResolvedTheme,
  profileId: TerminalThemeProfileId = DEFAULT_TERMINAL_THEME_PROFILE_ID,
): ITheme {
  const fallback = FALLBACKS[resolvedTheme];
  const profile = getTerminalThemeProfile(profileId);
  const background = resolveCssToken("--terminal", fallback.background);
  const foreground = resolveCssToken("--foreground", fallback.foreground);
  const cursor = resolveCssToken("--primary", fallback.cursor);
  const muted = resolveCssToken("--muted-foreground", fallback.muted);

  return {
    ...profile.variants[resolvedTheme].ansi,
    background,
    foreground,
    cursor,
    cursorAccent: resolveCssToken("--terminal", fallback.cursorAccent),
    selectionBackground: withAlpha(cursor, 0.2),
    selectionInactiveBackground: withAlpha(muted, 0.18),
    scrollbarSliderBackground: withAlpha(muted, 0.24),
    scrollbarSliderHoverBackground: withAlpha(muted, 0.42),
    scrollbarSliderActiveBackground: withAlpha(muted, 0.56),
  };
}

export function getTerminalSemanticPalette(
  resolvedTheme: ResolvedTheme,
  profileId: TerminalThemeProfileId = DEFAULT_TERMINAL_THEME_PROFILE_ID,
): TerminalSemanticPalette {
  return getTerminalThemeProfile(profileId).variants[resolvedTheme].semantic;
}

export function getCurrentResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function resolveCssToken(token: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (!value) {
    return fallback;
  }

  const context = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    return fallback;
  }

  context.canvas.width = 1;
  context.canvas.height = 1;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = fallback;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function withAlpha(color: string, alpha: number) {
  const channels = color.match(/[\d.]+/g);
  if (!channels || channels.length < 3) {
    return color;
  }

  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
