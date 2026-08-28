export const THEME_MODES = ["system", "light", "dark"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = Exclude<ThemeMode, "system">;

const THEME_STORAGE_KEY = "connex.theme-mode";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_MODES.some((mode) => mode === value);
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedMode) ? storedMode : "system";
  } catch {
    return "system";
  }
}

export function storeThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme persistence is best-effort; the active theme still works in memory.
  }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") {
    return mode;
  }

  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolvedTheme = resolveTheme(mode);
  const root = document.documentElement;

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = mode;
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

export function initializeTheme() {
  return applyTheme(readStoredThemeMode());
}

export function getSystemThemeQuery() {
  return window.matchMedia(SYSTEM_THEME_QUERY);
}
