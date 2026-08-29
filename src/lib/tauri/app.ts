import { invoke } from "@tauri-apps/api/core";

import type { AppInfo, AppPreferences, UpdateAppPreferencesInput } from "@/types/app";

const APP_INFO_COMMAND = "get_app_info";
const APP_PREFERENCES_COMMAND = "get_app_preferences";
const UPDATE_APP_PREFERENCES_COMMAND = "update_app_preferences";

export function getAppInfo() {
  return invoke<AppInfo>(APP_INFO_COMMAND);
}

export function getAppPreferences() {
  return invoke<AppPreferences>(APP_PREFERENCES_COMMAND);
}

export function updateAppPreferences(input: UpdateAppPreferencesInput) {
  return invoke<AppPreferences>(UPDATE_APP_PREFERENCES_COMMAND, { input });
}
