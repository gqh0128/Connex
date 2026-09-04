import { getCurrentWebview } from "@tauri-apps/api/webview";

export function setWebviewZoom(scaleFactor: number) {
  return getCurrentWebview().setZoom(scaleFactor);
}
