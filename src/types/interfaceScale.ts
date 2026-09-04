export const INTERFACE_SCALE_OPTIONS = [
  75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160,
  165, 170, 175,
] as const;

export type InterfaceScalePercent = (typeof INTERFACE_SCALE_OPTIONS)[number];

export const DEFAULT_INTERFACE_SCALE_PERCENT: InterfaceScalePercent = 100;

export function isInterfaceScalePercent(
  value: unknown,
): value is InterfaceScalePercent {
  return (
    typeof value === "number" &&
    INTERFACE_SCALE_OPTIONS.some((option) => option === value)
  );
}

export function parseInterfaceScalePercent(
  value: string,
): InterfaceScalePercent | null {
  const percent = Number(value);
  return isInterfaceScalePercent(percent) ? percent : null;
}

export function getInterfaceScaleFactor(percent: InterfaceScalePercent) {
  return percent / 100;
}
