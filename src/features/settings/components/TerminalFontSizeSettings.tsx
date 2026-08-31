import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  adjustTerminalFontSize,
  getTerminalFontSizeShortcutLabel,
  normalizeTerminalFontSize,
} from "@/features/terminal/terminalFontSize";
import { getCommandError } from "@/lib/tauri/errors";
import type { AppPreferences } from "@/types/app";

type TerminalFontSizeSettingsProps = {
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
};

export function TerminalFontSizeSettings({
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  onAppPreferencesChange,
}: TerminalFontSizeSettingsProps) {
  const [fontSizeDraft, setFontSizeDraft] = useState(
    String(appPreferences.terminalFontSize),
  );
  const [isSavingFontSize, setIsSavingFontSize] = useState(false);
  const [isSavingShortcuts, setIsSavingShortcuts] = useState(false);
  const [fontSizeError, setFontSizeError] = useState<string | null>(null);
  const [shortcutsError, setShortcutsError] = useState<string | null>(null);
  const isFontSizeDisabled = isAppPreferencesLoading || isSavingFontSize;
  const isShortcutsDisabled = isAppPreferencesLoading || isSavingShortcuts;
  const displayedFontSizeError = fontSizeError ?? appPreferencesError;
  const displayedShortcutsError = shortcutsError ?? appPreferencesError;

  const saveFontSize = async (value: number) => {
    const nextFontSize = normalizeTerminalFontSize(value);
    setFontSizeDraft(String(nextFontSize));
    setFontSizeError(null);
    if (nextFontSize === appPreferences.terminalFontSize) {
      return;
    }

    setIsSavingFontSize(true);
    try {
      await onAppPreferencesChange({ terminalFontSize: nextFontSize });
    } catch (nextError: unknown) {
      setFontSizeDraft(String(appPreferences.terminalFontSize));
      setFontSizeError(getCommandError(nextError).message);
    } finally {
      setIsSavingFontSize(false);
    }
  };

  const saveFontSizeDraft = () => {
    const parsed = Number(fontSizeDraft);
    if (!fontSizeDraft || !Number.isFinite(parsed)) {
      setFontSizeDraft(String(appPreferences.terminalFontSize));
      return;
    }
    void saveFontSize(parsed);
  };

  const adjustFontSize = (direction: "increase" | "decrease") => {
    void saveFontSize(
      adjustTerminalFontSize(appPreferences.terminalFontSize, direction),
    );
  };

  const saveShortcutsEnabled = async (isEnabled: boolean) => {
    setIsSavingShortcuts(true);
    setShortcutsError(null);
    try {
      await onAppPreferencesChange({ terminalFontSizeShortcutsEnabled: isEnabled });
    } catch (nextError: unknown) {
      setShortcutsError(getCommandError(nextError).message);
    } finally {
      setIsSavingShortcuts(false);
    }
  };

  return (
    <>
      <Field
        orientation="responsive"
        className="p-5"
        data-disabled={isFontSizeDisabled}
        data-invalid={Boolean(displayedFontSizeError)}
      >
        <FieldContent>
          <FieldLabel htmlFor="terminal-font-size">终端字号</FieldLabel>
          <FieldDescription id="terminal-font-size-description">
            仅调整 xterm.js 终端文字，范围为 {TERMINAL_FONT_SIZE_MIN}–
            {TERMINAL_FONT_SIZE_MAX} px。
          </FieldDescription>
          <FieldError>{displayedFontSizeError}</FieldError>
        </FieldContent>

        <InputGroup size="sm" className="w-40" data-disabled={isFontSizeDisabled}>
          <InputGroupAddon>
            <InputGroupButton
              size="icon-xs"
              disabled={
                isFontSizeDisabled ||
                appPreferences.terminalFontSize <= TERMINAL_FONT_SIZE_MIN
              }
              aria-label="减小终端字号"
              onClick={() => adjustFontSize("decrease")}
            >
              <Minus data-icon="inline-start" />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupInput
            id="terminal-font-size"
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={fontSizeDraft}
            disabled={isFontSizeDisabled}
            aria-invalid={Boolean(displayedFontSizeError)}
            aria-describedby="terminal-font-size-description"
            className="text-center"
            onChange={(event) => {
              if (/^\d{0,2}$/u.test(event.target.value)) {
                setFontSizeDraft(event.target.value);
              }
            }}
            onBlur={saveFontSizeDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setFontSizeDraft(String(appPreferences.terminalFontSize));
                event.currentTarget.blur();
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>px</InputGroupText>
            <InputGroupButton
              size="icon-xs"
              disabled={
                isFontSizeDisabled ||
                appPreferences.terminalFontSize >= TERMINAL_FONT_SIZE_MAX
              }
              aria-label="增大终端字号"
              onClick={() => adjustFontSize("increase")}
            >
              <Plus data-icon="inline-start" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <Separator />

      <Field
        orientation="horizontal"
        className="p-5"
        data-disabled={isShortcutsDisabled}
        data-invalid={Boolean(displayedShortcutsError)}
      >
        <FieldContent>
          <FieldLabel htmlFor="terminal-font-size-shortcuts">快捷键调整字号</FieldLabel>
          <FieldDescription>
            终端获得焦点时，使用 {getTerminalFontSizeShortcutLabel()} 调整字号。
          </FieldDescription>
          <FieldError>{displayedShortcutsError}</FieldError>
        </FieldContent>
        <Checkbox
          id="terminal-font-size-shortcuts"
          checked={appPreferences.terminalFontSizeShortcutsEnabled}
          disabled={isShortcutsDisabled}
          aria-invalid={Boolean(displayedShortcutsError)}
          onCheckedChange={(checked) => void saveShortcutsEnabled(checked === true)}
        />
      </Field>
    </>
  );
}
