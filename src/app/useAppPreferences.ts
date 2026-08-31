import { useCallback, useEffect, useRef, useState } from "react";

import { getAppPreferences, updateAppPreferences } from "@/lib/tauri/app";
import { getCommandError } from "@/lib/tauri/errors";
import type { AppPreferences } from "@/types/app";
import type { CommandError } from "@/types/ipc";
import { DEFAULT_TERMINAL_FONT_ID } from "@/features/terminal/terminalFontProfiles";

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  confirmBeforeExit: true,
  terminalSemanticHighlightingEnabled: true,
  terminalFontId: DEFAULT_TERMINAL_FONT_ID,
};

export type AppPreferencesController = {
  preferences: AppPreferences;
  isLoading: boolean;
  error: CommandError | null;
  update: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
};

export function useAppPreferences(): AppPreferencesController {
  const preferencesRef = useRef(DEFAULT_APP_PREFERENCES);
  const updateChainRef = useRef(Promise.resolve());
  const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<CommandError | null>(null);

  const applyPreferences = useCallback((nextPreferences: AppPreferences) => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
  }, []);

  useEffect(() => {
    let isDisposed = false;

    void getAppPreferences()
      .then((storedPreferences) => {
        if (!isDisposed) {
          applyPreferences(storedPreferences);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!isDisposed) {
          setError(getCommandError(nextError));
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsLoading(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [applyPreferences]);

  const update = useCallback(
    (changes: Partial<AppPreferences>) => {
      const operation = updateChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const savedPreferences = await updateAppPreferences({
            ...preferencesRef.current,
            ...changes,
          });
          applyPreferences(savedPreferences);
          setError(null);
          return savedPreferences;
        })
        .catch((nextError: unknown) => {
          const commandError = getCommandError(nextError);
          setError(commandError);
          throw commandError;
        });
      updateChainRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [applyPreferences],
  );

  return { preferences, isLoading, error, update };
}
