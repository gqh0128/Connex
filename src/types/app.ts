export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
  terminalSemanticHighlightingEnabled: boolean;
};

export type UpdateAppPreferencesInput = AppPreferences;
