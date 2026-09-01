import { createContext } from "react";

import type { ColorSchemeId } from "./colorSchemes";
import type { ResolvedTheme, ThemeMode } from "./theme";

export type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colorSchemeId: ColorSchemeId;
  setMode: (mode: ThemeMode) => void;
  setColorSchemeId: (colorSchemeId: ColorSchemeId) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
