export type AppInfo = {
  name: string;
  version: string;
};

export type AppPreferences = {
  confirmBeforeExit: boolean;
};

export type UpdateAppPreferencesInput = {
  confirmBeforeExit: boolean;
};
