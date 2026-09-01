import { setTheme as setNativeTheme } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  applyColorScheme,
  readStoredColorSchemeId,
  storeColorSchemeId,
  type ColorSchemeId,
} from "./colorSchemes";
import {
  applyTheme,
  getSystemThemeQuery,
  readStoredThemeMode,
  resolveTheme,
  storeThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";
import { ThemeContext } from "./themeContext";

async function syncNativeTheme(theme: ResolvedTheme) {
  if (!isTauri()) {
    return;
  }

  try {
    await setNativeTheme(theme);
  } catch (error) {
    console.warn("Unable to synchronize the native window theme.", error);
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode);
  const [colorSchemeId, setColorSchemeIdState] = useState<ColorSchemeId>(
    readStoredColorSchemeId,
  );
  const [systemTheme, setSystemTheme] = useState(() => resolveTheme("system"));
  const resolvedTheme = mode === "system" ? systemTheme : mode;

  const setMode = useCallback((nextMode: ThemeMode) => {
    storeThemeMode(nextMode);
    setModeState(nextMode);

    const nextTheme = applyTheme(nextMode);
    if (nextMode === "system") {
      setSystemTheme(nextTheme);
    }
    void syncNativeTheme(nextTheme);
  }, []);

  const setColorSchemeId = useCallback((nextColorSchemeId: ColorSchemeId) => {
    storeColorSchemeId(nextColorSchemeId);
    applyColorScheme(nextColorSchemeId);
    setColorSchemeIdState(nextColorSchemeId);
  }, []);

  useEffect(() => {
    const nextTheme = applyTheme(mode);
    void syncNativeTheme(nextTheme);

    if (mode !== "system") {
      return;
    }

    const systemThemeQuery = getSystemThemeQuery();
    const handleSystemThemeChange = () => {
      const systemTheme = applyTheme("system");
      setSystemTheme(systemTheme);
      void syncNativeTheme(systemTheme);
    };

    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      systemThemeQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [mode]);

  useEffect(() => {
    applyColorScheme(colorSchemeId);
  }, [colorSchemeId]);

  const value = useMemo(
    () => ({ mode, resolvedTheme, colorSchemeId, setMode, setColorSchemeId }),
    [colorSchemeId, mode, resolvedTheme, setColorSchemeId, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
