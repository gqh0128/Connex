export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
  terminalSemanticHighlightingEnabled: boolean;
  terminalFontId: string;
};

export type UpdateAppPreferencesInput = AppPreferences;
