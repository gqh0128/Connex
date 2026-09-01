export const SYSTEM_TERMINAL_FONT_ID = "preset:system-monospace";
export const DEFAULT_TERMINAL_FONT_ID = "preset:jetbrains-mono";
export const CUSTOM_TERMINAL_FONT_PREFIX = "custom:";
export const SYSTEM_TERMINAL_FONT_PREFIX = "system-font:";

export const SYSTEM_MONOSPACE_FONT_FAMILY =
  '"SFMono-Regular", "Cascadia Mono", "Noto Sans Mono CJK SC", Menlo, Consolas, monospace';

type SystemTerminalFontProfile = {
  id: string;
  kind: "system";
  label: string;
  description: string;
  fontFamily: string;
  availabilityFamilies?: readonly string[];
  importAliases?: readonly string[];
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

const FIRA_CODE_FAMILY = "Connex Fira Code";
const JETBRAINS_MONO_FAMILY = "Connex JetBrains Mono";
const CASCADIA_CODE_FAMILY = "Connex Cascadia Code";
const SOURCE_CODE_PRO_FAMILY = "Connex Source Code Pro";

export const TERMINAL_FONT_PROFILES: readonly TerminalFontProfile[] = [
  {
    id: "preset:fira-code",
    kind: "bundled",
    label: "Fira Code",
    description: "Connex 内置，带编程连字的开源等宽字体。",
    fontFamily: `"${FIRA_CODE_FAMILY}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    preloadFamilies: [
      `300 13px "${FIRA_CODE_FAMILY}"`,
      `500 13px "${FIRA_CODE_FAMILY}"`,
      `700 13px "${FIRA_CODE_FAMILY}"`,
    ],
  },
  {
    id: DEFAULT_TERMINAL_FONT_ID,
    kind: "bundled",
    label: "JetBrains Mono",
    description: "Connex 内置并默认使用，针对代码和终端阅读优化。",
    fontFamily: `"${JETBRAINS_MONO_FAMILY}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    preloadFamilies: [
      `100 13px "${JETBRAINS_MONO_FAMILY}"`,
      `500 13px "${JETBRAINS_MONO_FAMILY}"`,
      `800 13px "${JETBRAINS_MONO_FAMILY}"`,
      `italic 100 13px "${JETBRAINS_MONO_FAMILY}"`,
      `italic 500 13px "${JETBRAINS_MONO_FAMILY}"`,
      `italic 800 13px "${JETBRAINS_MONO_FAMILY}"`,
    ],
  },
  {
    id: "preset:cascadia-code",
    kind: "bundled",
    label: "Cascadia Code",
    description: "Connex 内置，Microsoft 开源的终端字体。",
    fontFamily: `"${CASCADIA_CODE_FAMILY}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    preloadFamilies: [
      `200 13px "${CASCADIA_CODE_FAMILY}"`,
      `500 13px "${CASCADIA_CODE_FAMILY}"`,
      `700 13px "${CASCADIA_CODE_FAMILY}"`,
      `italic 400 13px "${CASCADIA_CODE_FAMILY}"`,
    ],
  },
  {
    id: "preset:source-code-pro",
    kind: "bundled",
    label: "Source Code Pro",
    description: "Connex 内置，Adobe 开源的代码字体。",
    fontFamily: `"${SOURCE_CODE_PRO_FAMILY}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    preloadFamilies: [
      `200 13px "${SOURCE_CODE_PRO_FAMILY}"`,
      `500 13px "${SOURCE_CODE_PRO_FAMILY}"`,
      `900 13px "${SOURCE_CODE_PRO_FAMILY}"`,
      `italic 400 13px "${SOURCE_CODE_PRO_FAMILY}"`,
    ],
  },
  {
    id: "preset:sf-mono-menlo",
    kind: "system",
    label: "SF Mono / Menlo",
    description: "优先使用 macOS 自带的 SF Mono 或 Menlo。",
    fontFamily: `"SF Mono", "SFMono-Regular", Menlo, ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    availabilityFamilies: ["SF Mono", "SFMono-Regular", "Menlo"],
    importAliases: ["SF Mono", "Menlo"],
  },
  {
    id: "preset:consolas",
    kind: "system",
    label: "Consolas",
    description: "优先使用 Windows 自带的 Consolas。",
    fontFamily: `Consolas, ${SYSTEM_MONOSPACE_FONT_FAMILY}`,
    availabilityFamilies: ["Consolas"],
    importAliases: ["Consolas"],
  },
  {
    id: SYSTEM_TERMINAL_FONT_ID,
    kind: "system",
    label: "System Monospace",
    description: "使用当前操作系统提供的首选等宽字体。",
    fontFamily: SYSTEM_MONOSPACE_FONT_FAMILY,
  },
];

const PRESET_SYSTEM_FAMILY_NAMES = new Set([
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Fira Code",
  "JetBrains Mono",
  "Menlo",
  "SF Mono",
  "SFMono-Regular",
  "Source Code Pro",
]);

export function getTerminalFontProfile(id: string) {
  return TERMINAL_FONT_PROFILES.find((profile) => profile.id === id) ?? null;
}

export function terminalFontProfileNeedsSystemCheck(id: string) {
  const profile = getTerminalFontProfile(id);
  return Boolean(
    profile?.kind === "system" &&
    profile.availabilityFamilies &&
    profile.availabilityFamilies.length > 0,
  );
}

export function findImportedTerminalFontForProfile<T extends { displayName: string }>(
  profile: TerminalFontProfile,
  fonts: readonly T[],
) {
  if (profile.kind !== "system" || !profile.importAliases) {
    return null;
  }
  const aliases = profile.importAliases.map(normalizeImportedFontName);
  return (
    fonts.find((font) => {
      const name = normalizeImportedFontName(font.displayName);
      return aliases.includes(name);
    }) ?? null
  );
}

export function customTerminalFontSelectionId(id: string) {
  return `${CUSTOM_TERMINAL_FONT_PREFIX}${id}`;
}

export function customTerminalFontId(selectionId: string) {
  return selectionId.startsWith(CUSTOM_TERMINAL_FONT_PREFIX)
    ? selectionId.slice(CUSTOM_TERMINAL_FONT_PREFIX.length)
    : null;
}

export function systemTerminalFontSelectionId(familyName: string) {
  return `${SYSTEM_TERMINAL_FONT_PREFIX}${familyName}`;
}

export function systemTerminalFontName(selectionId: string) {
  return selectionId.startsWith(SYSTEM_TERMINAL_FONT_PREFIX)
    ? selectionId.slice(SYSTEM_TERMINAL_FONT_PREFIX.length)
    : null;
}

export function systemTerminalFontFamily(familyName: string) {
  const escapedFamilyName = familyName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escapedFamilyName}", ${SYSTEM_MONOSPACE_FONT_FAMILY}`;
}

export function isPresetSystemFamily(familyName: string) {
  return PRESET_SYSTEM_FAMILY_NAMES.has(familyName);
}

function normalizeImportedFontName(name: string) {
  return name.trim().toLocaleLowerCase();
}
