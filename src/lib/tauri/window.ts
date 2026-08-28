import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

type WindowOperation = (appWindow: Window) => Promise<void>;

async function runWindowOperation(operation: WindowOperation) {
  if (!isTauri()) {
    return;
  }

  await operation(getCurrentWindow());
}

export function minimizeAppWindow() {
  return runWindowOperation((appWindow) => appWindow.minimize());
}

export function toggleAppWindowMaximize() {
  return runWindowOperation((appWindow) => appWindow.toggleMaximize());
}

export function closeAppWindow() {
  return runWindowOperation((appWindow) => appWindow.close());
}
