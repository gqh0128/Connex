import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteTerminalFont,
  importTerminalFont,
  listTerminalFonts,
} from "@/lib/tauri/terminalFonts";
import { getCommandError } from "@/lib/tauri/errors";
import type { CustomTerminalFont } from "@/types/terminalFonts";

import {
  DEFAULT_TERMINAL_FONT_ID,
  SYSTEM_MONOSPACE_FONT_FAMILY,
  TERMINAL_FONT_PROFILES,
  customTerminalFontId,
  customTerminalFontSelectionId,
} from "../terminalFontProfiles";
import {
  loadTerminalFontFamily,
  releaseCustomTerminalFont,
} from "../terminalFontLoader";

export type TerminalFontOption = {
  id: string;
  kind: "preset" | "custom";
  label: string;
  description: string;
  customFontId: string | null;
};

export type TerminalFontsController = {
  options: TerminalFontOption[];
  selectedOption: TerminalFontOption;
  activeFontFamily: string;
  isLoading: boolean;
  error: string | null;
  importFont: (path: string) => Promise<CustomTerminalFont>;
  deleteFont: (id: string) => Promise<void>;
};

export function useTerminalFonts(selectionId: string): TerminalFontsController {
  const [customFonts, setCustomFonts] = useState<CustomTerminalFont[]>([]);
  const [isListLoaded, setIsListLoaded] = useState(false);
  const [activeFontFamily, setActiveFontFamily] = useState(
    SYSTEM_MONOSPACE_FONT_FAMILY,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;
    void listTerminalFonts()
      .then((fonts) => {
        if (!isDisposed) {
          setCustomFonts(fonts);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!isDisposed) {
          setError(getCommandError(nextError).message);
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsListLoaded(true);
        }
      });
    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (customTerminalFontId(selectionId) && !isListLoaded) {
      return;
    }
    let isDisposed = false;
    void loadTerminalFontFamily(selectionId, customFonts)
      .then((fontFamily) => {
        if (!isDisposed) {
          setActiveFontFamily(fontFamily);
          setError(null);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setActiveFontFamily(SYSTEM_MONOSPACE_FONT_FAMILY);
          setError("字体无法在终端中加载，已临时使用系统等宽字体。");
        }
      });
    return () => {
      isDisposed = true;
    };
  }, [customFonts, isListLoaded, selectionId]);

  const importFont = useCallback(async (path: string) => {
    try {
      const font = await importTerminalFont(path);
      setCustomFonts((current) => [...current, font]);
      setError(null);
      return font;
    } catch (nextError: unknown) {
      const commandError = getCommandError(nextError);
      setError(commandError.message);
      throw commandError;
    }
  }, []);

  const deleteFont = useCallback(async (id: string) => {
    try {
      await deleteTerminalFont(id);
      releaseCustomTerminalFont(id);
      setCustomFonts((current) => current.filter((font) => font.id !== id));
      setError(null);
    } catch (nextError: unknown) {
      const commandError = getCommandError(nextError);
      setError(commandError.message);
      throw commandError;
    }
  }, []);

  const options = useMemo<TerminalFontOption[]>(
    () => [
      ...TERMINAL_FONT_PROFILES.map((profile) => ({
        id: profile.id,
        kind: "preset" as const,
        label: profile.label,
        description: profile.description,
        customFontId: null,
      })),
      ...customFonts.map((font) => ({
        id: customTerminalFontSelectionId(font.id),
        kind: "custom" as const,
        label: font.displayName,
        description: `已导入 · ${font.format.toUpperCase()} · ${formatBytes(font.byteLength)}`,
        customFontId: font.id,
      })),
    ],
    [customFonts],
  );

  const selectedOption =
    options.find((option) => option.id === selectionId) ??
    options.find((option) => option.id === DEFAULT_TERMINAL_FONT_ID) ??
    options[0];

  return {
    options,
    selectedOption,
    activeFontFamily,
    isLoading: !isListLoaded,
    error,
    importFont,
    deleteFont,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
