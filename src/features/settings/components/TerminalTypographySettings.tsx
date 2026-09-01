import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  adjustTerminalFontSize,
  getTerminalFontSizeShortcutLabel,
  normalizeTerminalFontSize,
} from "@/features/terminal/terminalFontSize";
import {
  TERMINAL_FONT_WEIGHT_MAX,
  TERMINAL_FONT_WEIGHT_MIN,
  adjustTerminalFontWeight,
  getTerminalFontWeightLabel,
  normalizeTerminalFontWeight,
} from "@/features/terminal/terminalFontWeight";
import {
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  adjustTerminalLineHeight,
  formatTerminalLineHeight,
  normalizeTerminalLineHeight,
} from "@/features/terminal/terminalLineHeight";
import { getCommandError } from "@/lib/tauri/errors";
import type { AppPreferences } from "@/types/app";

import { TerminalMetricSettingsField } from "./TerminalMetricSettingsField";

type TerminalTypographySettingsProps = {
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
};

export function TerminalTypographySettings({
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  onAppPreferencesChange,
}: TerminalTypographySettingsProps) {
  const [isSavingShortcuts, setIsSavingShortcuts] = useState(false);
  const [shortcutsError, setShortcutsError] = useState<string | null>(null);
  const isShortcutsDisabled = isAppPreferencesLoading || isSavingShortcuts;
  const displayedShortcutsError = shortcutsError ?? appPreferencesError;

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
      <TerminalMetricSettingsField
        id="terminal-font-weight"
        label="终端字重"
        description={
          <>
            调整普通终端文字的粗细，范围为 {TERMINAL_FONT_WEIGHT_MIN}–
            {TERMINAL_FONT_WEIGHT_MAX}
            ；粗体自动比正文增加两档。部分单字重字体可能不支持变化。
          </>
        }
        value={appPreferences.terminalFontWeight}
        min={TERMINAL_FONT_WEIGHT_MIN}
        max={TERMINAL_FONT_WEIGHT_MAX}
        maxLength={3}
        inputMode="numeric"
        suffix={getTerminalFontWeightLabel(appPreferences.terminalFontWeight)}
        isDisabled={isAppPreferencesLoading}
        externalError={appPreferencesError}
        isDraftAllowed={(draft) => /^\d{0,3}$/u.test(draft)}
        normalize={normalizeTerminalFontWeight}
        format={String}
        adjust={adjustTerminalFontWeight}
        onValueChange={async (fontWeight) => {
          await onAppPreferencesChange({ terminalFontWeight: fontWeight });
        }}
      />

      <Separator />

      <TerminalMetricSettingsField
        id="terminal-font-size"
        label="终端字号"
        description={
          <>
            仅调整 xterm.js 终端文字，范围为 {TERMINAL_FONT_SIZE_MIN}–
            {TERMINAL_FONT_SIZE_MAX} px。
          </>
        }
        value={appPreferences.terminalFontSize}
        min={TERMINAL_FONT_SIZE_MIN}
        max={TERMINAL_FONT_SIZE_MAX}
        maxLength={2}
        inputMode="numeric"
        suffix="px"
        isDisabled={isAppPreferencesLoading}
        externalError={appPreferencesError}
        isDraftAllowed={(draft) => /^\d{0,2}$/u.test(draft)}
        normalize={normalizeTerminalFontSize}
        format={String}
        adjust={adjustTerminalFontSize}
        onValueChange={async (fontSize) => {
          await onAppPreferencesChange({ terminalFontSize: fontSize });
        }}
      />

      <Separator />

      <TerminalMetricSettingsField
        id="terminal-line-height"
        label="终端行距"
        description={
          <>
            调整终端每行文字的垂直间距，范围为 {TERMINAL_LINE_HEIGHT_MIN.toFixed(2)}–
            {TERMINAL_LINE_HEIGHT_MAX.toFixed(2)} 倍。
          </>
        }
        value={appPreferences.terminalLineHeight}
        min={TERMINAL_LINE_HEIGHT_MIN}
        max={TERMINAL_LINE_HEIGHT_MAX}
        maxLength={4}
        inputMode="decimal"
        suffix="×"
        isDisabled={isAppPreferencesLoading}
        externalError={appPreferencesError}
        isDraftAllowed={(draft) => /^\d?(?:\.\d{0,2})?$/u.test(draft)}
        normalize={normalizeTerminalLineHeight}
        format={formatTerminalLineHeight}
        adjust={adjustTerminalLineHeight}
        onValueChange={async (lineHeight) => {
          await onAppPreferencesChange({ terminalLineHeight: lineHeight });
        }}
      />

      <Separator />

      <Field
        orientation="horizontal"
        className="p-4"
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
