import { invoke } from "@tauri-apps/api/core";

import type { AppInfo } from "@/types/app";

const APP_INFO_COMMAND = "get_app_info";

export function getAppInfo() {
  return invoke<AppInfo>(APP_INFO_COMMAND);
}
