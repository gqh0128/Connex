import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  INTERFACE_SCALE_OPTIONS,
  parseInterfaceScalePercent,
  type InterfaceScalePercent,
} from "@/types/interfaceScale";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
} from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCommandError } from "@/lib/tauri/errors";
import type { AppPreferences } from "@/types/app";

type InterfaceScaleSettingProps = {
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  interfaceScaleError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
};

export function InterfaceScaleSetting({
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  interfaceScaleError,
  onAppPreferencesChange,
}: InterfaceScaleSettingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const isDisabled = isAppPreferencesLoading || isSaving;
  const displayedError = saveError ?? interfaceScaleError ?? appPreferencesError;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({ block: "nearest" });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [appPreferences.interfaceScalePercent, isOpen]);

  const updateScale = async (percent: InterfaceScalePercent) => {
    setIsOpen(false);
    setIsSaving(true);
    setSaveError(null);
    try {
      await onAppPreferencesChange({ interfaceScalePercent: percent });
    } catch (nextError: unknown) {
      setSaveError(getCommandError(nextError).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Field
      orientation="horizontal"
      className="p-4"
      data-disabled={isDisabled}
      data-invalid={Boolean(displayedError)}
    >
      <FieldContent>
        <FieldTitle>界面缩放</FieldTitle>
        <FieldDescription>按比例缩放整个桌面界面，修改后立即生效。</FieldDescription>
        <FieldError>{displayedError}</FieldError>
      </FieldContent>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-20 justify-between"
            disabled={isDisabled}
            aria-label={`界面缩放，当前 ${appPreferences.interfaceScalePercent}%`}
            aria-expanded={isOpen}
            aria-invalid={Boolean(displayedError)}
          >
            {appPreferences.interfaceScalePercent}%
            <ChevronDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-20 p-1">
          <ScrollArea className="h-56">
            <ToggleGroup
              type="single"
              orientation="vertical"
              size="xs"
              spacing={1}
              value={String(appPreferences.interfaceScalePercent)}
              aria-label="界面缩放比例"
              className="flex w-full flex-col items-stretch pr-2"
              onValueChange={(value) => {
                const percent = parseInterfaceScalePercent(value);
                if (percent && percent !== appPreferences.interfaceScalePercent) {
                  void updateScale(percent);
                }
              }}
            >
              {INTERFACE_SCALE_OPTIONS.map((percent) => {
                const isSelected = percent === appPreferences.interfaceScalePercent;

                return (
                  <ToggleGroupItem
                    ref={isSelected ? selectedOptionRef : undefined}
                    key={percent}
                    value={String(percent)}
                    aria-label={`${percent}%`}
                    className="w-full"
                  >
                    {percent}%
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
