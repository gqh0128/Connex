import type { ITheme } from "@xterm/xterm";

import type { ResolvedTheme } from "@/app/theme";

const LIGHT_ANSI = {
  black: "#2E3440",
  red: "#C93C4A",
  green: "#1D7A4D",
  yellow: "#8A5A00",
  blue: "#2457A6",
  magenta: "#7A3E9D",
  cyan: "#0B6B75",
  white: "#4B5563",
  brightBlack: "#6B7280",
  brightRed: "#D13445",
  brightGreen: "#178052",
  brightYellow: "#986000",
  brightBlue: "#2F6FD0",
  brightMagenta: "#9854B7",
  brightCyan: "#0F7482",
  brightWhite: "#374151",
} satisfies ITheme;

const DARK_ANSI = {
  black: "#1C222B",
  red: "#FF6B7A",
  green: "#42D392",
  yellow: "#E5C07B",
  blue: "#61AFEF",
  magenta: "#C678DD",
  cyan: "#56B6C2",
  white: "#D6DEE8",
  brightBlack: "#747D8D",
  brightRed: "#FF8793",
  brightGreen: "#63E6AE",
  brightYellow: "#F0D399",
  brightBlue: "#82C7FF",
  brightMagenta: "#D79AE8",
  brightCyan: "#75D1DA",
  brightWhite: "#F4F7FA",
} satisfies ITheme;

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

export function createTerminalTheme(resolvedTheme: ResolvedTheme): ITheme {
  const fallback = FALLBACKS[resolvedTheme];
  const background = resolveCssToken("--terminal", fallback.background);
  const foreground = resolveCssToken("--foreground", fallback.foreground);
  const cursor = resolveCssToken("--primary", fallback.cursor);
  const muted = resolveCssToken("--muted-foreground", fallback.muted);

  return {
    ...(resolvedTheme === "dark" ? DARK_ANSI : LIGHT_ANSI),
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
