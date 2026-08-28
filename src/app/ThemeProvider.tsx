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

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
