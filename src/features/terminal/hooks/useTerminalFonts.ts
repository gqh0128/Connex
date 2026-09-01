import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCommandError } from "@/lib/tauri/errors";
import {
  deleteTerminalFont,
  importTerminalFont,
  listSystemTerminalFonts,
  listTerminalFonts,
} from "@/lib/tauri/terminalFonts";
import type { CustomTerminalFont } from "@/types/terminalFonts";

import { loadTerminalFont, releaseCustomTerminalFont } from "../terminalFontLoader";
import {
  DEFAULT_TERMINAL_FONT_ID,
  SYSTEM_MONOSPACE_FONT_FAMILY,
  TERMINAL_FONT_PROFILES,
  customTerminalFontId,
  customTerminalFontSelectionId,
  findImportedTerminalFontForProfile,
  isPresetSystemFamily,
  systemTerminalFontName,
  systemTerminalFontSelectionId,
  terminalFontProfileNeedsSystemCheck,
} from "../terminalFontProfiles";

type TerminalFontAvailability = "available" | "unavailable" | "unknown";

export type TerminalFontOption = {
  id: string;
  kind: "preset" | "system" | "custom";
  label: string;
  description: string;
  customFontId: string | null;
  resourceCustomFontId: string | null;
  availability: TerminalFontAvailability;
  isThirdPartyResource: boolean;
};

export type TerminalFontsController = {
  options: TerminalFontOption[];
  selectedOption: TerminalFontOption;
  activeFontFamily: string;
  isLoading: boolean;
  isSystemFontsLoading: boolean;
  error: string | null;
  fallbackNotice: string | null;
  loadSystemFonts: () => Promise<void>;
  importFont: (path: string) => Promise<CustomTerminalFont>;
  deleteFont: (id: string) => Promise<void>;
};

export function useTerminalFonts(selectionId: string): TerminalFontsController {
  const [customFonts, setCustomFonts] = useState<CustomTerminalFont[]>([]);
  const [systemFontNames, setSystemFontNames] = useState<string[]>([]);
  const [isCustomListLoaded, setIsCustomListLoaded] = useState(false);
  const [isSystemListLoaded, setIsSystemListLoaded] = useState(false);
  const [isSystemFontsLoading, setIsSystemFontsLoading] = useState(false);
  const [activeFontFamily, setActiveFontFamily] = useState(
    SYSTEM_MONOSPACE_FONT_FAMILY,
  );
  const [operationError, setOperationError] = useState<string | null>(null);
  const [systemFontsError, setSystemFontsError] = useState<string | null>(null);
  const [activeFontError, setActiveFontError] = useState<string | null>(null);
  const systemFontLoad = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let isDisposed = false;
    void listTerminalFonts()
      .then((fonts) => {
        if (!isDisposed) {
          setCustomFonts(fonts);
          setOperationError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!isDisposed) {
          setOperationError(getCommandError(nextError).message);
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsCustomListLoaded(true);
        }
      });
    return () => {
      isDisposed = true;
    };
  }, []);

  const loadSystemFonts = useCallback(async () => {
    if (isSystemListLoaded) {
      return;
    }
    if (!systemFontLoad.current) {
      setIsSystemFontsLoading(true);
      systemFontLoad.current = listSystemTerminalFonts()
        .then((fonts) => {
          setSystemFontNames(fonts);
          setIsSystemListLoaded(true);
          setSystemFontsError(null);
        })
        .catch((nextError: unknown) => {
          systemFontLoad.current = null;
          setSystemFontsError(getCommandError(nextError).message);
        })
        .finally(() => {
          setIsSystemFontsLoading(false);
        });
    }
    await systemFontLoad.current;
  }, [isSystemListLoaded]);

  useEffect(() => {
    if (
      (systemTerminalFontName(selectionId) ||
        terminalFontProfileNeedsSystemCheck(selectionId)) &&
      !isSystemListLoaded
    ) {
      void loadSystemFonts();
    }
  }, [isSystemListLoaded, loadSystemFonts, selectionId]);

  useEffect(() => {
    if (customTerminalFontId(selectionId) && !isCustomListLoaded) {
      return;
    }
    if (systemTerminalFontName(selectionId) && !isSystemListLoaded) {
      return;
    }
    let isDisposed = false;
    void loadTerminalFont(selectionId, customFonts, systemFontNames)
      .then((fontFamily) => {
        if (!isDisposed) {
          setActiveFontFamily(fontFamily);
          setActiveFontError(null);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setActiveFontFamily(SYSTEM_MONOSPACE_FONT_FAMILY);
          setActiveFontError("字体无法在终端中加载，已临时使用系统等宽字体。");
        }
      });
    return () => {
      isDisposed = true;
    };
  }, [
    customFonts,
    isCustomListLoaded,
    isSystemListLoaded,
    selectionId,
    systemFontNames,
  ]);

  const importFont = useCallback(async (path: string) => {
    try {
      const font = await importTerminalFont(path);
      setCustomFonts((current) => [...current, font]);
      setOperationError(null);
      return font;
    } catch (nextError: unknown) {
      const commandError = getCommandError(nextError);
      setOperationError(commandError.message);
      throw commandError;
    }
  }, []);

  const deleteFont = useCallback(async (id: string) => {
    try {
      await deleteTerminalFont(id);
      releaseCustomTerminalFont(id);
      setCustomFonts((current) => current.filter((font) => font.id !== id));
      setOperationError(null);
    } catch (nextError: unknown) {
      const commandError = getCommandError(nextError);
      setOperationError(commandError.message);
      throw commandError;
    }
  }, []);

  const options = useMemo<TerminalFontOption[]>(
    () => [
      ...TERMINAL_FONT_PROFILES.map((profile) => {
        const importedResource = findImportedTerminalFontForProfile(
          profile,
          customFonts,
        );
        const isSystemResourceAvailable =
          profile.kind === "system" && profile.availabilityFamilies
            ? profile.availabilityFamilies.some((familyName) =>
                systemFontNames.includes(familyName),
              )
            : true;
        const isThirdPartyResource = Boolean(
          importedResource && !isSystemResourceAvailable,
        );
        const availability =
          profile.kind !== "system" || !profile.availabilityFamilies
            ? ("available" as const)
            : isSystemResourceAvailable || importedResource
              ? ("available" as const)
              : !isSystemListLoaded
                ? ("unknown" as const)
                : ("unavailable" as const);
        return {
          id: profile.id,
          kind: "preset" as const,
          label: profile.label,
          description: isThirdPartyResource
            ? `使用已导入的 ${importedResource?.displayName ?? profile.label} 字体文件。`
            : profile.description,
          customFontId: null,
          resourceCustomFontId: isThirdPartyResource
            ? (importedResource?.id ?? null)
            : null,
          availability,
          isThirdPartyResource,
        };
      }),
      ...systemFontNames
        .filter((familyName) => !isPresetSystemFamily(familyName))
        .map((familyName) => ({
          id: systemTerminalFontSelectionId(familyName),
          kind: "system" as const,
          label: familyName,
          description: "本机已安装的等宽字体。",
          customFontId: null,
          resourceCustomFontId: null,
          availability: "available" as const,
          isThirdPartyResource: false,
        })),
      ...customFonts.map((font) => ({
        id: customTerminalFontSelectionId(font.id),
        kind: "custom" as const,
        label: font.displayName,
        description: `已导入 · ${font.format.toUpperCase()} · ${formatBytes(font.byteLength)}`,
        customFontId: font.id,
        resourceCustomFontId: font.id,
        availability: "available" as const,
        isThirdPartyResource: false,
      })),
    ],
    [customFonts, isSystemListLoaded, systemFontNames],
  );

  const selectedOption =
    options.find((option) => option.id === selectionId) ??
    options.find((option) => option.id === DEFAULT_TERMINAL_FONT_ID) ??
    options[0];
  const fallbackNotice =
    selectedOption.availability === "unavailable"
      ? `本机未安装 ${selectedOption.label}，当前终端已回退到 System Monospace。`
      : null;

  return {
    options,
    selectedOption,
    activeFontFamily,
    isLoading: !isCustomListLoaded,
    isSystemFontsLoading,
    error: operationError ?? systemFontsError ?? activeFontError,
    fallbackNotice,
    loadSystemFonts,
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
