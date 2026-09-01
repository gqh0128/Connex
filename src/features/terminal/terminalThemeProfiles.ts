import type { ITheme } from "@xterm/xterm";

import type { ResolvedTheme } from "@/app/theme";

export const DEFAULT_TERMINAL_THEME_PROFILE_ID = "connex-neutral";

export type TerminalThemeProfileId = typeof DEFAULT_TERMINAL_THEME_PROFILE_ID;

export type TerminalSemanticTokenKind =
  "url" | "option" | "path" | "environment" | "host";

export type TerminalSemanticPalette = Readonly<
  Record<TerminalSemanticTokenKind, string>
>;

export type TerminalSearchPalette = Readonly<{
  matchBackground: string;
  matchBorder: string;
  activeMatchBackground: string;
  activeMatchBorder: string;
}>;

type TerminalThemeVariant = {
  foreground: string;
  ansi: Readonly<ITheme>;
  semantic: TerminalSemanticPalette;
  search: TerminalSearchPalette;
};

export type TerminalThemeProfile = {
  id: TerminalThemeProfileId;
  label: string;
  variants: Readonly<Record<ResolvedTheme, TerminalThemeVariant>>;
};

const CONNEX_NEUTRAL_PROFILE = {
  id: DEFAULT_TERMINAL_THEME_PROFILE_ID,
  label: "Connex Neutral",
  variants: {
    light: {
      foreground: "#15171A",
      ansi: {
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
      },
      semantic: {
        url: "#2457A6",
        option: "#ff6f00",
        path: "#0B6B75",
        environment: "#7A3E9D",
        host: "#1D7A4D",
      },
      search: {
        matchBackground: "#FFE7A3",
        matchBorder: "#C78300",
        activeMatchBackground: "#FFB020",
        activeMatchBorder: "#7A4B00",
      },
    },
    dark: {
      foreground: "#E8E9ED",
      ansi: {
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
      },
      semantic: {
        url: "#82C7FF",
        option: "#ff6f00",
        path: "#75D1DA",
        environment: "#D79AE8",
        host: "#63E6AE",
      },
      search: {
        matchBackground: "#5A4A00",
        matchBorder: "#D6B83F",
        activeMatchBackground: "#B86B00",
        activeMatchBorder: "#FFB84D",
      },
    },
  },
} satisfies TerminalThemeProfile;

export const TERMINAL_THEME_PROFILES = [CONNEX_NEUTRAL_PROFILE] as const;

export function getTerminalThemeProfile(
  profileId: TerminalThemeProfileId,
): TerminalThemeProfile {
  return (
    TERMINAL_THEME_PROFILES.find((profile) => profile.id === profileId) ??
    CONNEX_NEUTRAL_PROFILE
  );
}
