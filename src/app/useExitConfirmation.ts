import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";

import { getAppPreferences, updateAppPreferences } from "@/lib/tauri/app";
import { getCommandError } from "@/lib/tauri/errors";
import type { CommandError } from "@/types/ipc";

export type ExitConfirmationController = {
  confirmBeforeExit: boolean;
  isPreferencesLoading: boolean;
  preferenceError: CommandError | null;
  isPromptOpen: boolean;
  shouldRememberChoice: boolean;
  isExiting: boolean;
  exitError: CommandError | null;
  setShouldRememberChoice: (shouldRemember: boolean) => void;
  setConfirmBeforeExit: (confirmBeforeExit: boolean) => Promise<void>;
  cancelExit: () => void;
  confirmExit: () => Promise<void>;
};

export function useExitConfirmation(): ExitConfirmationController {
  const appWindowRef = useRef(getCurrentWindow());
  const confirmBeforeExitRef = useRef(true);
  const isPromptOpenRef = useRef(false);
  const isDestroyingRef = useRef(false);
  const [confirmBeforeExit, setConfirmBeforeExitState] = useState(true);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(true);
  const [preferenceError, setPreferenceError] = useState<CommandError | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [shouldRememberChoice, setShouldRememberChoice] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<CommandError | null>(null);

  const applyConfirmBeforeExit = useCallback((nextValue: boolean) => {
    confirmBeforeExitRef.current = nextValue;
    setConfirmBeforeExitState(nextValue);
  }, []);

  const openPrompt = useCallback(() => {
    if (isPromptOpenRef.current) {
      return;
    }

    isPromptOpenRef.current = true;
    setShouldRememberChoice(false);
    setExitError(null);
    setIsPromptOpen(true);
  }, []);

  const closePrompt = useCallback(() => {
    isPromptOpenRef.current = false;
    setIsPromptOpen(false);
  }, []);

  const destroyWindow = useCallback(async () => {
    isDestroyingRef.current = true;
    try {
      await appWindowRef.current.destroy();
    } catch (error) {
      isDestroyingRef.current = false;
      throw error;
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;

    void getAppPreferences()
      .then((preferences) => {
        if (!isDisposed) {
          applyConfirmBeforeExit(preferences.confirmBeforeExit);
          setPreferenceError(null);
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          setPreferenceError(getCommandError(error));
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsPreferencesLoading(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [applyConfirmBeforeExit]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;

    void appWindowRef.current
      .onCloseRequested((event) => {
        if (isDestroyingRef.current) {
          return;
        }

        event.preventDefault();
        if (confirmBeforeExitRef.current) {
          openPrompt();
          return;
        }

        void destroyWindow().catch((error: unknown) => {
          openPrompt();
          setExitError(getCommandError(error));
        });
      })
      .then((nextUnlisten) => {
        if (isDisposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          setPreferenceError(getCommandError(error));
        }
      });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [destroyWindow, openPrompt]);

  const setConfirmBeforeExit = useCallback(
    async (nextValue: boolean) => {
      const preferences = await updateAppPreferences({
        confirmBeforeExit: nextValue,
      });
      applyConfirmBeforeExit(preferences.confirmBeforeExit);
      setPreferenceError(null);
    },
    [applyConfirmBeforeExit],
  );

  const cancelExit = useCallback(() => {
    if (isExiting) {
      return;
    }

    closePrompt();
    setShouldRememberChoice(false);
    setExitError(null);
  }, [closePrompt, isExiting]);

  const confirmExit = useCallback(async () => {
    setIsExiting(true);
    setExitError(null);

    try {
      if (shouldRememberChoice) {
        await setConfirmBeforeExit(false);
      }
      await destroyWindow();
    } catch (error) {
      setExitError(getCommandError(error));
      setIsExiting(false);
    }
  }, [destroyWindow, setConfirmBeforeExit, shouldRememberChoice]);

  return {
    confirmBeforeExit,
    isPreferencesLoading,
    preferenceError,
    isPromptOpen,
    shouldRememberChoice,
    isExiting,
    exitError,
    setShouldRememberChoice,
    setConfirmBeforeExit,
    cancelExit,
    confirmExit,
  };
}
