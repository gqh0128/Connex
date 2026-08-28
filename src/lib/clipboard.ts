export function canReadClipboardText() {
  return typeof navigator.clipboard?.readText === "function";
}

export function canWriteClipboardText() {
  return typeof navigator.clipboard?.writeText === "function";
}

export async function readClipboardText() {
  if (!canReadClipboardText()) {
    throw new Error("Clipboard text reading is unavailable");
  }

  return navigator.clipboard.readText();
}

export async function writeClipboardText(value: string) {
  if (!canWriteClipboardText()) {
    throw new Error("Clipboard text writing is unavailable");
  }

  await navigator.clipboard.writeText(value);
}
