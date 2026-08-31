import { Monitor, Moon, Sun, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { isThemeMode } from "@/app/theme";
import { useTheme } from "@/app/useTheme";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TerminalFontsController } from "@/features/terminal/hooks/useTerminalFonts";
import { getTerminalBoldFontWeight } from "@/features/terminal/terminalFontWeight";
import {
  getTerminalThemeProfile,
  type TerminalThemeProfileId,
} from "@/features/terminal/terminalThemeProfiles";
import type { AppPreferences } from "@/types/app";

import { ConnectionBackupSettings } from "./ConnectionBackupSettings";
import { TerminalAppearancePreview } from "./TerminalAppearancePreview";
import { TerminalFontSettings } from "./TerminalFontSettings";
import { TerminalTypographySettings } from "./TerminalTypographySettings";

type SettingsWorkspaceProps = {
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
  terminalThemeProfileId: TerminalThemeProfileId;
  terminalFonts: TerminalFontsController;
  onConnectionsImported: () => void;
};

export function SettingsWorkspace({
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  onAppPreferencesChange,
  terminalThemeProfileId,
  terminalFonts,
  onConnectionsImported,
}: SettingsWorkspaceProps) {
  const { mode, resolvedTheme, setMode } = useTheme();
  const [isSavingExitPreference, setIsSavingExitPreference] = useState(false);
  const [exitPreferenceError, setExitPreferenceError] = useState<string | null>(null);
  const [isSavingSemanticHighlighting, setIsSavingSemanticHighlighting] =
    useState(false);
  const [semanticHighlightingError, setSemanticHighlightingError] = useState<
    string | null
  >(null);
  const terminalThemeProfile = getTerminalThemeProfile(terminalThemeProfileId);

  const updateExitPreference = async (nextValue: boolean) => {
    setIsSavingExitPreference(true);
    setExitPreferenceError(null);
    try {
      await onAppPreferencesChange({ confirmBeforeExit: nextValue });
    } catch {
      setExitPreferenceError("无法保存退出设置，请稍后重试。");
    } finally {
      setIsSavingExitPreference(false);
    }
  };

  const displayedExitPreferenceError = exitPreferenceError ?? appPreferencesError;
  const isExitPreferenceDisabled = isAppPreferencesLoading || isSavingExitPreference;
  const displayedSemanticHighlightingError =
    semanticHighlightingError ?? appPreferencesError;
  const isSemanticHighlightingDisabled =
    isAppPreferencesLoading || isSavingSemanticHighlighting;

  const updateSemanticHighlighting = async (nextValue: boolean) => {
    setIsSavingSemanticHighlighting(true);
    setSemanticHighlightingError(null);
    try {
      await onAppPreferencesChange({
        terminalSemanticHighlightingEnabled: nextValue,
      });
    } catch {
      setSemanticHighlightingError("无法保存终端高亮设置，请稍后重试。");
    } finally {
      setIsSavingSemanticHighlighting(false);
    }
  };

  return (
    <ScrollArea className="min-h-0 flex-1 bg-workspace">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm text-muted-foreground">
            管理 Connex 的行为、界面外观与本地连接数据。
          </p>
        </header>

        <section className="flex flex-col gap-3" aria-labelledby="general-heading">
          <h2 id="general-heading" className="text-sm font-semibold">
            通用
          </h2>

          <div className="overflow-hidden rounded-lg border bg-surface">
            <FieldGroup className="gap-0">
              <Field
                orientation="horizontal"
                className="p-5"
                data-disabled={isExitPreferenceDisabled}
                data-invalid={Boolean(displayedExitPreferenceError)}
              >
                <FieldContent>
                  <FieldLabel htmlFor="confirm-before-exit">退出前确认</FieldLabel>
                  <FieldDescription>
                    关闭 Connex 时先询问，避免意外中断 SSH 会话或文件传输。
                  </FieldDescription>
                  <FieldError>{displayedExitPreferenceError}</FieldError>
                </FieldContent>
                <Checkbox
                  id="confirm-before-exit"
                  checked={appPreferences.confirmBeforeExit}
                  disabled={isExitPreferenceDisabled}
                  aria-invalid={Boolean(displayedExitPreferenceError)}
                  onCheckedChange={(checked) =>
                    void updateExitPreference(checked === true)
                  }
                />
              </Field>
            </FieldGroup>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="appearance-heading">
          <div className="flex items-center gap-3">
            <h2 id="appearance-heading" className="text-sm font-semibold">
              外观
            </h2>
            <Badge variant="outline">
              当前{resolvedTheme === "dark" ? "深色" : "浅色"}
            </Badge>
          </div>

          <div className="overflow-hidden rounded-lg border bg-surface">
            <FieldGroup className="gap-0">
              <Field orientation="responsive" className="p-5">
                <FieldContent>
                  <FieldTitle id="theme-mode-label">界面主题</FieldTitle>
                  <FieldDescription>
                    跟随系统会在操作系统切换外观时自动更新。
                  </FieldDescription>
                </FieldContent>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={mode}
                  aria-labelledby="theme-mode-label"
                  onValueChange={(value) => {
                    if (isThemeMode(value)) {
                      setMode(value);
                    }
                  }}
                >
                  <ToggleGroupItem value="system" aria-label="跟随系统">
                    <Monitor />
                    跟随系统
                  </ToggleGroupItem>
                  <ToggleGroupItem value="light" aria-label="浅色">
                    <Sun />
                    浅色
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dark" aria-label="深色">
                    <Moon />
                    深色
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Separator />

              <Field orientation="horizontal" className="p-5">
                <FieldContent>
                  <FieldTitle>终端配色</FieldTitle>
                  <FieldDescription>
                    使用 Connex Neutral ANSI 配色，并随应用主题切换。
                  </FieldDescription>
                </FieldContent>
                <div className="flex items-center gap-2">
                  <TerminalSquare className="size-4 text-muted-foreground" />
                  <Badge variant="secondary">跟随应用</Badge>
                </div>
              </Field>

              <Separator />

              <Field
                orientation="horizontal"
                className="p-5"
                data-disabled={isSemanticHighlightingDisabled}
                data-invalid={Boolean(displayedSemanticHighlightingError)}
              >
                <FieldContent>
                  <FieldLabel htmlFor="terminal-semantic-highlighting">
                    终端语义高亮
                  </FieldLabel>
                  <FieldDescription>
                    使用 {terminalThemeProfile.label}{" "}
                    识别链接、命令选项、路径、环境变量和主机地址；远端 ANSI
                    配色保持优先。
                  </FieldDescription>
                  <FieldError>{displayedSemanticHighlightingError}</FieldError>
                </FieldContent>
                <Checkbox
                  id="terminal-semantic-highlighting"
                  checked={appPreferences.terminalSemanticHighlightingEnabled}
                  disabled={isSemanticHighlightingDisabled}
                  aria-invalid={Boolean(displayedSemanticHighlightingError)}
                  onCheckedChange={(checked) =>
                    void updateSemanticHighlighting(checked === true)
                  }
                />
              </Field>

              <Separator />

              <TerminalAppearancePreview
                themeProfileId={terminalThemeProfileId}
                fontFamily={terminalFonts.activeFontFamily}
                fontWeight={appPreferences.terminalFontWeight}
                fontWeightBold={getTerminalBoldFontWeight(
                  appPreferences.terminalFontWeight,
                )}
                fontSize={appPreferences.terminalFontSize}
                lineHeight={appPreferences.terminalLineHeight}
              />

              <Separator />

              <TerminalFontSettings
                appPreferences={appPreferences}
                isAppPreferencesLoading={isAppPreferencesLoading}
                appPreferencesError={appPreferencesError}
                onAppPreferencesChange={onAppPreferencesChange}
                terminalFonts={terminalFonts}
              />

              <Separator />

              <TerminalTypographySettings
                appPreferences={appPreferences}
                isAppPreferencesLoading={isAppPreferencesLoading}
                appPreferencesError={appPreferencesError}
                onAppPreferencesChange={onAppPreferencesChange}
              />
            </FieldGroup>
          </div>
        </section>

        <ConnectionBackupSettings onImported={onConnectionsImported} />
      </div>
    </ScrollArea>
  );
}
