export function isMacOSPlatform() {
  return (
    /Mac/u.test(window.navigator.platform) ||
    /Macintosh|Mac OS X/u.test(window.navigator.userAgent)
  );
}

export function getPrimaryShortcutModifierLabel() {
  return isMacOSPlatform() ? "⌘" : "Ctrl";
}

export function hasPrimaryShortcutModifier(
  event: Pick<KeyboardEvent | MouseEvent, "altKey" | "ctrlKey" | "metaKey">,
) {
  if (event.altKey) {
    return false;
  }
  return isMacOSPlatform()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
