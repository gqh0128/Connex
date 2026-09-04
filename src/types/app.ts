import type { ColorSchemeId } from "@/app/colorSchemes";

import type { InterfaceScalePercent } from "./interfaceScale";

export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
  colorSchemeId: ColorSchemeId;
  interfaceScalePercent: InterfaceScalePercent;
  terminalSemanticHighlightingEnabled: boolean;
  terminalFontId: string;
  terminalFontWeight: number;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalFontSizeShortcutsEnabled: boolean;
};

export type UpdateAppPreferencesInput = AppPreferences;
