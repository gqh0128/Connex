import {
  getPrimaryShortcutModifierLabel,
  hasPrimaryShortcutModifier,
} from "@/lib/platform";

export const TERMINAL_FONT_SIZE_MIN = 9;
export const TERMINAL_FONT_SIZE_MAX = 32;
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const TERMINAL_FONT_SIZE_STEP = 1;

export type TerminalFontSizeDirection = "increase" | "decrease";

export function normalizeTerminalFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
  return Math.min(
    TERMINAL_FONT_SIZE_MAX,
    Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(value)),
  );
}

export function adjustTerminalFontSize(
  value: number,
  direction: TerminalFontSizeDirection,
) {
  const delta =
    direction === "increase" ? TERMINAL_FONT_SIZE_STEP : -TERMINAL_FONT_SIZE_STEP;
  return normalizeTerminalFontSize(value + delta);
}

export function getTerminalFontSizeShortcut(event: KeyboardEvent) {
  if (!hasPrimaryShortcutModifier(event)) {
    return null;
  }

  if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
    return "increase" satisfies TerminalFontSizeDirection;
  }
  if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
    return "decrease" satisfies TerminalFontSizeDirection;
  }
  return null;
}

export function getTerminalFontSizeShortcutLabel() {
  const modifier = getPrimaryShortcutModifierLabel();
  return `${modifier} + / ${modifier} −`;
}
