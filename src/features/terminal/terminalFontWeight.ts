export const TERMINAL_FONT_WEIGHT_MIN = 100;
export const TERMINAL_FONT_WEIGHT_MAX = 800;
export const DEFAULT_TERMINAL_FONT_WEIGHT = 500;
export const TERMINAL_FONT_WEIGHT_STEP = 100;

export type TerminalFontWeightDirection = "increase" | "decrease";

const FONT_WEIGHT_LABELS: Readonly<Record<number, string>> = {
  100: "Thin",
  200: "XLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SBold",
  700: "Bold",
  800: "XBold",
};

export function normalizeTerminalFontWeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_WEIGHT;
  }

  const stepped =
    Math.round(value / TERMINAL_FONT_WEIGHT_STEP) * TERMINAL_FONT_WEIGHT_STEP;
  return Math.min(
    TERMINAL_FONT_WEIGHT_MAX,
    Math.max(TERMINAL_FONT_WEIGHT_MIN, stepped),
  );
}

export function adjustTerminalFontWeight(
  value: number,
  direction: TerminalFontWeightDirection,
) {
  const delta =
    direction === "increase" ? TERMINAL_FONT_WEIGHT_STEP : -TERMINAL_FONT_WEIGHT_STEP;
  return normalizeTerminalFontWeight(value + delta);
}

export function getTerminalBoldFontWeight(value: number) {
  return Math.min(
    TERMINAL_FONT_WEIGHT_MAX,
    normalizeTerminalFontWeight(value) + TERMINAL_FONT_WEIGHT_STEP * 2,
  );
}

export function getTerminalFontWeightLabel(value: number) {
  return FONT_WEIGHT_LABELS[normalizeTerminalFontWeight(value)] ?? "Custom";
}
