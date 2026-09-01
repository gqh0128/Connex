export const COLOR_SCHEMES = [
  {
    id: "pine",
    label: "松柏绿",
    description: "清晰、稳健的 Connex 默认配色",
  },
  {
    id: "business-blue",
    label: "商务蓝",
    description: "克制、可靠的专业蓝色",
  },
  {
    id: "graphite",
    label: "石墨灰",
    description: "低干扰的中性灰色",
  },
  {
    id: "deep-teal",
    label: "深海青",
    description: "沉静、专注的青色",
  },
  {
    id: "indigo",
    label: "沉稳靛",
    description: "冷静、内敛的靛蓝色",
  },
  {
    id: "warm-stone",
    label: "暖岩棕",
    description: "温和、耐看的暖色",
  },
] as const;

export type ColorSchemeId = (typeof COLOR_SCHEMES)[number]["id"];

export const DEFAULT_COLOR_SCHEME_ID: ColorSchemeId = "pine";

const COLOR_SCHEME_STORAGE_KEY = "connex.color-scheme";

export function isColorSchemeId(value: string | null): value is ColorSchemeId {
  return COLOR_SCHEMES.some((scheme) => scheme.id === value);
}

export function getColorScheme(colorSchemeId: ColorSchemeId) {
  return (
    COLOR_SCHEMES.find((scheme) => scheme.id === colorSchemeId) ?? COLOR_SCHEMES[0]
  );
}

export function readStoredColorSchemeId(): ColorSchemeId {
  try {
    const storedColorSchemeId = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    return isColorSchemeId(storedColorSchemeId)
      ? storedColorSchemeId
      : DEFAULT_COLOR_SCHEME_ID;
  } catch {
    return DEFAULT_COLOR_SCHEME_ID;
  }
}

export function storeColorSchemeId(colorSchemeId: ColorSchemeId) {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorSchemeId);
  } catch {
    // Startup-critical appearance persistence is best-effort.
  }
}

export function applyColorScheme(colorSchemeId: ColorSchemeId) {
  document.documentElement.dataset.colorScheme = colorSchemeId;
}
