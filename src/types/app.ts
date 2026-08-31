export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
  terminalSemanticHighlightingEnabled: boolean;
  terminalFontId: string;
  terminalFontWeight: number;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalFontSizeShortcutsEnabled: boolean;
};

export type UpdateAppPreferencesInput = AppPreferences;
