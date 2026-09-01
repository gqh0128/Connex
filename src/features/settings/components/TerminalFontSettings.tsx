import {
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
  const [fontQuery, setFontQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontToDelete, setFontToDelete] = useState<TerminalFontOption | null>(null);
  const displayedError = error ?? terminalFonts.error ?? appPreferencesError;
  const isDisabled = isAppPreferencesLoading || isSaving || isImporting || isDeleting;
  const normalizedQuery = fontQuery.trim().toLocaleLowerCase();
  const visibleOptions = terminalFonts.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalizedQuery),
  );
  const presetOptions = visibleOptions.filter((option) => option.kind === "preset");
  const systemOptions = visibleOptions.filter((option) => option.kind === "system");
  const customOptions = visibleOptions.filter((option) => option.kind === "custom");

  const setPickerOpen = (open: boolean) => {
    setIsPickerOpen(open);
    if (open) {
      void terminalFonts.loadSystemFonts();
    } else {
      setFontQuery("");
    }
  };

  const selectFont = async (selectionId: string) => {
    if (selectionId === appPreferences.terminalFontId) {
      setPickerOpen(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onAppPreferencesChange({ terminalFontId: selectionId });
      setPickerOpen(false);
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
      setPickerOpen(false);
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
      if (
        fontToDelete.id === appPreferences.terminalFontId ||
        terminalFonts.selectedOption.resourceCustomFontId === fontToDelete.customFontId
      ) {
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
        className="p-4"
        data-disabled={isDisabled}
        data-invalid={Boolean(displayedError)}
      >
        <FieldContent>
          <FieldTitle>终端字体</FieldTitle>
          <FieldDescription>
            仅应用于 xterm.js 终端。可选择七个常用预设、本机等宽字体，或导入不超过 10 MB
            的 TTF、OTF、WOFF 和 WOFF2 文件。
          </FieldDescription>
          {terminalFonts.fallbackNotice ? (
            <FieldDescription className="text-warning">
              {terminalFonts.fallbackNotice}
            </FieldDescription>
          ) : null}
          <FieldError>{displayedError}</FieldError>
        </FieldContent>

        <div className="flex shrink-0 items-center gap-2">
          <Popover open={isPickerOpen} onOpenChange={setPickerOpen}>
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
              <div className="relative px-1 py-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  density="compact"
                  value={fontQuery}
                  onChange={(event) => setFontQuery(event.target.value)}
                  className="pl-8"
                  placeholder="搜索字体"
                  aria-label="搜索终端字体"
                />
              </div>
              <div
                className="flex max-h-80 flex-col gap-1 overflow-y-auto py-1"
                role="radiogroup"
                aria-label="终端字体"
              >
                {presetOptions.length > 0 ? (
                  <FontOptionGroup
                    label="常用预设"
                    options={presetOptions}
                    selectedId={appPreferences.terminalFontId}
                    disabled={isDisabled}
                    onSelect={(id) => void selectFont(id)}
                    onDelete={setFontToDelete}
                  />
                ) : null}
                {systemOptions.length > 0 ? (
                  <FontOptionGroup
                    label="本机等宽字体"
                    options={systemOptions}
                    selectedId={appPreferences.terminalFontId}
                    disabled={isDisabled}
                    onSelect={(id) => void selectFont(id)}
                    onDelete={setFontToDelete}
                  />
                ) : terminalFonts.isSystemFontsLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    正在读取本机等宽字体…
                  </div>
                ) : null}
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
                {visibleOptions.length === 0 && !terminalFonts.isSystemFontsLoading ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    没有匹配的字体
                  </div>
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
              disabled={disabled || option.availability !== "available"}
              onClick={() => onSelect(option.id)}
            >
              {isSelected ? <Check data-icon="inline-start" /> : null}
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className="truncate">{option.label}</span>
                  {option.availability === "unavailable" ? (
                    <Badge variant="secondary" className="shrink-0">
                      未安装
                    </Badge>
                  ) : option.availability === "unknown" ? (
                    <Badge variant="secondary" className="shrink-0">
                      检测中
                    </Badge>
                  ) : option.isThirdPartyResource ? (
                    <Badge variant="secondary" className="shrink-0">
                      第三方资源
                    </Badge>
                  ) : null}
                </span>
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
