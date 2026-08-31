import { Check, ChevronDown, LoaderCircle, Trash2, Type, Upload } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  TerminalFontOption,
  TerminalFontsController,
} from "@/features/terminal/hooks/useTerminalFonts";
import {
  DEFAULT_TERMINAL_FONT_ID,
  customTerminalFontSelectionId,
} from "@/features/terminal/terminalFontProfiles";
import { chooseTerminalFontFile } from "@/lib/tauri/dialogs";
import { getCommandError } from "@/lib/tauri/errors";
import type { AppPreferences } from "@/types/app";

type TerminalFontSettingsProps = {
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
  terminalFonts: TerminalFontsController;
};

export function TerminalFontSettings({
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  onAppPreferencesChange,
  terminalFonts,
}: TerminalFontSettingsProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontToDelete, setFontToDelete] = useState<TerminalFontOption | null>(null);
  const displayedError = error ?? terminalFonts.error ?? appPreferencesError;
  const isDisabled = isAppPreferencesLoading || isSaving || isImporting || isDeleting;
  const presetOptions = terminalFonts.options.filter(
    (option) => option.kind === "preset",
  );
  const customOptions = terminalFonts.options.filter(
    (option) => option.kind === "custom",
  );

  const selectFont = async (selectionId: string) => {
    if (selectionId === appPreferences.terminalFontId) {
      setIsPickerOpen(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onAppPreferencesChange({ terminalFontId: selectionId });
      setIsPickerOpen(false);
    } catch {
      setError("无法保存终端字体设置，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const importFont = async () => {
    setError(null);
    const selected = await chooseTerminalFontFile();
    if (!selected || Array.isArray(selected)) {
      return;
    }
    setIsImporting(true);
    try {
      const font = await terminalFonts.importFont(selected);
      await onAppPreferencesChange({
        terminalFontId: customTerminalFontSelectionId(font.id),
      });
      setIsPickerOpen(false);
    } catch (nextError: unknown) {
      setError(getCommandError(nextError).message);
    } finally {
      setIsImporting(false);
    }
  };

  const deleteFont = async () => {
    if (!fontToDelete?.customFontId) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      if (fontToDelete.id === appPreferences.terminalFontId) {
        await onAppPreferencesChange({ terminalFontId: DEFAULT_TERMINAL_FONT_ID });
      }
      await terminalFonts.deleteFont(fontToDelete.customFontId);
      setFontToDelete(null);
    } catch (nextError: unknown) {
      setError(getCommandError(nextError).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Field
        orientation="responsive"
        className="p-5"
        data-disabled={isDisabled}
        data-invalid={Boolean(displayedError)}
      >
        <FieldContent>
          <FieldTitle>终端字体</FieldTitle>
          <FieldDescription>
            仅应用于 xterm.js 终端。支持内置预设以及不超过 10 MB 的 TTF、OTF、WOFF 和
            WOFF2 文件。
          </FieldDescription>
          <FieldError>{displayedError}</FieldError>
        </FieldContent>

        <div className="flex shrink-0 items-center gap-2">
          <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDisabled || terminalFonts.isLoading}
                aria-label={`当前终端字体：${terminalFonts.selectedOption.label}`}
              >
                <Type data-icon="inline-start" />
                <span className="max-w-36 truncate">
                  {terminalFonts.selectedOption.label}
                </span>
                <ChevronDown data-icon="inline-end" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <PopoverHeader className="px-2 py-1">
                <PopoverTitle>选择终端字体</PopoverTitle>
                <PopoverDescription>切换后立即应用到所有终端会话。</PopoverDescription>
              </PopoverHeader>
              <div
                className="flex max-h-80 flex-col gap-1 overflow-y-auto py-1"
                role="radiogroup"
                aria-label="终端字体"
              >
                <FontOptionGroup
                  label="内置预设"
                  options={presetOptions}
                  selectedId={appPreferences.terminalFontId}
                  disabled={isDisabled}
                  onSelect={(id) => void selectFont(id)}
                  onDelete={setFontToDelete}
                />
                {customOptions.length > 0 ? (
                  <FontOptionGroup
                    label="已导入"
                    options={customOptions}
                    selectedId={appPreferences.terminalFontId}
                    disabled={isDisabled}
                    onSelect={(id) => void selectFont(id)}
                    onDelete={setFontToDelete}
                  />
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDisabled}
            onClick={() => void importFont()}
          >
            {isImporting ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Upload data-icon="inline-start" />
            )}
            导入字体
          </Button>
        </div>
      </Field>

      <AlertDialog
        open={fontToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setFontToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{fontToDelete?.label}”？</AlertDialogTitle>
            <AlertDialogDescription>
              Connex 保存的字体副本会被删除，原始文件不会受到影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteFont();
              }}
            >
              {isDeleting ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : null}
              删除字体
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type FontOptionGroupProps = {
  label: string;
  options: TerminalFontOption[];
  selectedId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDelete: (option: TerminalFontOption) => void;
};

function FontOptionGroup({
  label,
  options,
  selectedId,
  disabled,
  onSelect,
  onDelete,
}: FontOptionGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {label === "已导入" ? <Badge variant="secondary">自定义</Badge> : null}
      </div>
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        return (
          <div key={option.id} className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              role="radio"
              aria-checked={isSelected}
              variant={isSelected ? "secondary" : "ghost"}
              className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left"
              disabled={disabled}
              onClick={() => onSelect(option.id)}
            >
              {isSelected ? <Check data-icon="inline-start" /> : null}
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="w-full truncate">{option.label}</span>
                <span className="w-full truncate text-xs font-normal text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </Button>
            {option.customFontId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`删除字体 ${option.label}`}
                onClick={() => onDelete(option)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
