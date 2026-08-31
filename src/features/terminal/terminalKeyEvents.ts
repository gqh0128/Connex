const TERMINAL_SYSTEM_MODIFIER_KEYS = new Set(["Meta", "OS", "Super", "Hyper"]);
const TERMINAL_SYSTEM_MODIFIER_CODES = new Set([
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

/**
 * xterm treats the macOS Command key as a regular key on parts of its keyboard
 * path. In embedded WebViews this can trigger its scroll-on-user-input behavior
 * or refocus the hidden textarea, moving a scrolled-back viewport to the bottom.
 *
 * Only consume the system modifier key itself. Combination key events such as
 * Command/Ctrl + C and the terminal font-size shortcuts continue to reach xterm
 * and the application shortcut handlers normally.
 */
export function isTerminalSystemModifierOnlyEvent(
  event: Pick<KeyboardEvent, "code" | "key" | "keyCode">,
) {
  return (
    TERMINAL_SYSTEM_MODIFIER_KEYS.has(event.key) ||
    TERMINAL_SYSTEM_MODIFIER_CODES.has(event.code) ||
    event.keyCode === 91 ||
    event.keyCode === 92 ||
    event.keyCode === 93
  );
}
