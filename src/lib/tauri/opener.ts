import { openUrl } from "@tauri-apps/plugin-opener";

export async function openExternalHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS links can be opened.");
  }

  await openUrl(url);
}
