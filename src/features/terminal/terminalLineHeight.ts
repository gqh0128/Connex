export const TERMINAL_LINE_HEIGHT_MIN = 1;
export const TERMINAL_LINE_HEIGHT_MAX = 2;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.1;
export const TERMINAL_LINE_HEIGHT_STEP = 0.05;

export type TerminalLineHeightDirection = "increase" | "decrease";

export function normalizeTerminalLineHeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_LINE_HEIGHT;
  }

  const bounded = Math.min(
    TERMINAL_LINE_HEIGHT_MAX,
    Math.max(TERMINAL_LINE_HEIGHT_MIN, value),
  );
  return Math.round(bounded * 100) / 100;
}

export function adjustTerminalLineHeight(
  value: number,
  direction: TerminalLineHeightDirection,
) {
  const delta =
    direction === "increase" ? TERMINAL_LINE_HEIGHT_STEP : -TERMINAL_LINE_HEIGHT_STEP;
  return normalizeTerminalLineHeight(value + delta);
}

export function formatTerminalLineHeight(value: number) {
  return normalizeTerminalLineHeight(value).toFixed(2);
}
