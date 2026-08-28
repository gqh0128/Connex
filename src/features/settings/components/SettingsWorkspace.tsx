import { Monitor, Moon, Sun, TerminalSquare } from "lucide-react";

import { isThemeMode } from "@/app/theme";
import { useTheme } from "@/app/useTheme";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function SettingsWorkspace() {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <ScrollArea className="min-h-0 flex-1 bg-workspace">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">外观</h1>
            <Badge variant="outline">
              当前{resolvedTheme === "dark" ? "深色" : "浅色"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            调整 Connex 的界面主题。终端默认跟随应用外观，不影响远程会话状态。
          </p>
        </header>

        <section className="overflow-hidden rounded-lg border bg-surface">
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
          </FieldGroup>
        </section>
      </div>
    </ScrollArea>
  );
}
