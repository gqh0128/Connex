export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
  terminalSemanticHighlightingEnabled: boolean;
  terminalFontId: string;
  terminalFontSize: number;
  terminalFontSizeShortcutsEnabled: boolean;
};

export type UpdateAppPreferencesInput = AppPreferences;
