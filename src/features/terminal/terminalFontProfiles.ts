export const SYSTEM_TERMINAL_FONT_ID = "preset:system-monospace";
export const DEFAULT_TERMINAL_FONT_ID = "preset:jetbrains-mono";
export const CUSTOM_TERMINAL_FONT_PREFIX = "custom:";

export const SYSTEM_MONOSPACE_FONT_FAMILY =
  '"SFMono-Regular", "Cascadia Mono", "Noto Sans Mono CJK SC", Menlo, Consolas, monospace';

type SystemTerminalFontProfile = {
  id: string;
  kind: "system";
  label: string;
  description: string;
  fontFamily: string;
};

type BundledTerminalFontProfile = {
  id: string;
  kind: "bundled";
  label: string;
  description: string;
  fontFamily: string;
  preloadFamilies: readonly string[];
};

export type TerminalFontProfile =
  SystemTerminalFontProfile | BundledTerminalFontProfile;

const JETBRAINS_MONO_FAMILY = "Connex JetBrains Mono";

export const TERMINAL_FONT_PROFILES = [
  {
    id: DEFAULT_TERMINAL_FONT_ID,
    kind: "bundled",
    label: "JetBrains Mono",
    description: "Connex 内置，针对代码和终端阅读优化。",
    fontFamily: `"${JETBRAINS_MONO_FAMILY}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    preloadFamilies: [
      `400 13px "${JETBRAINS_MONO_FAMILY}"`,
      `700 13px "${JETBRAINS_MONO_FAMILY}"`,
      `italic 400 13px "${JETBRAINS_MONO_FAMILY}"`,
      `italic 700 13px "${JETBRAINS_MONO_FAMILY}"`,
    ],
  },
  {
    id: SYSTEM_TERMINAL_FONT_ID,
    kind: "system",
    label: "系统等宽字体",
    description: "使用当前操作系统提供的首选等宽字体。",
    fontFamily: SYSTEM_MONOSPACE_FONT_FAMILY,
  },
] as const satisfies readonly TerminalFontProfile[];

export function getTerminalFontProfile(id: string) {
  return TERMINAL_FONT_PROFILES.find((profile) => profile.id === id) ?? null;
}

export function customTerminalFontSelectionId(id: string) {
  return `${CUSTOM_TERMINAL_FONT_PREFIX}${id}`;
}

export function customTerminalFontId(selectionId: string) {
  return selectionId.startsWith(CUSTOM_TERMINAL_FONT_PREFIX)
    ? selectionId.slice(CUSTOM_TERMINAL_FONT_PREFIX.length)
    : null;
}
