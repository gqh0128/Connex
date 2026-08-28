import { useCallback, useEffect, useRef, useState } from "react";

import { getCommandError } from "@/lib/tauri/errors";
import { listRemoteDirectory } from "@/lib/tauri/sftp";
import type { CommandError } from "@/types/ipc";
import type { SessionSnapshot } from "@/types/sessions";
import type { RemoteDirectory } from "@/types/sftp";

type RemoteFilesState = {
  sessionId: string | null;
  directory: RemoteDirectory | null;
  error: CommandError | null;
  isLoading: boolean;
  history: string[];
  historyIndex: number;
};

type NavigationRequest = {
  path?: string;
  mode: "reset" | "push" | "replace" | "history";
  historyIndex?: number;
};

export function useRemoteFiles(session: SessionSnapshot | null) {
  const connectedSessionId = session?.state === "connected" ? session.id : null;
  const requestIdRef = useRef(0);
  const failedNavigationRef = useRef<NavigationRequest | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFilesState>({
    sessionId: null,
    directory: null,
    error: null,
    isLoading: false,
    history: [],
    historyIndex: -1,
  });
  const currentRemoteFiles: RemoteFilesState =
    remoteFiles.sessionId === connectedSessionId
      ? remoteFiles
      : {
          sessionId: connectedSessionId,
          directory: null,
          error: null,
          isLoading: connectedSessionId !== null,
          history: [],
          historyIndex: -1,
        };

  const loadDirectory = useCallback(
    async (navigation: NavigationRequest) => {
      if (!connectedSessionId) {
        return;
      }

      const requestId = ++requestIdRef.current;
      setRemoteFiles((current) => ({
        sessionId: connectedSessionId,
        directory: current.sessionId === connectedSessionId ? current.directory : null,
        error: null,
        isLoading: true,
        history: current.sessionId === connectedSessionId ? current.history : [],
        historyIndex:
          current.sessionId === connectedSessionId ? current.historyIndex : -1,
      }));

      try {
        const nextDirectory = await listRemoteDirectory(
          connectedSessionId,
          navigation.path,
        );
        if (requestIdRef.current === requestId) {
          failedNavigationRef.current = null;
          setRemoteFiles((current) => {
            const navigationState = applySuccessfulNavigation(
              current.sessionId === connectedSessionId
                ? current
                : {
                    sessionId: connectedSessionId,
                    directory: null,
                    error: null,
                    isLoading: true,
                    history: [],
                    historyIndex: -1,
                  },
              navigation,
              nextDirectory.path,
            );

            return {
              sessionId: connectedSessionId,
              directory: nextDirectory,
              error: null,
              isLoading: false,
              ...navigationState,
            };
          });
        }
      } catch (nextError) {
        if (requestIdRef.current === requestId) {
          failedNavigationRef.current = navigation;
          setRemoteFiles((current) => ({
            sessionId: connectedSessionId,
            directory:
              current.sessionId === connectedSessionId ? current.directory : null,
            error: getCommandError(nextError),
            isLoading: false,
            history: current.sessionId === connectedSessionId ? current.history : [],
            historyIndex:
              current.sessionId === connectedSessionId ? current.historyIndex : -1,
          }));
        }
      }
    },
    [connectedSessionId],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    failedNavigationRef.current = null;

    if (connectedSessionId) {
      void loadDirectory({ mode: "reset" });
    }

    return () => {
      requestIdRef.current += 1;
    };
  }, [connectedSessionId, loadDirectory]);

  const refresh = useCallback(() => {
    void loadDirectory({
      path: currentRemoteFiles.directory?.path,
      mode: "replace",
    });
  }, [currentRemoteFiles.directory?.path, loadDirectory]);

  const openDirectory = useCallback(
    (path: string) => {
      void loadDirectory({ path, mode: "push" });
    },
    [loadDirectory],
  );

  const goBack = useCallback(() => {
    const historyIndex = currentRemoteFiles.historyIndex - 1;
    const path = currentRemoteFiles.history[historyIndex];
    if (path) {
      void loadDirectory({ path, mode: "history", historyIndex });
    }
  }, [currentRemoteFiles.history, currentRemoteFiles.historyIndex, loadDirectory]);

  const goForward = useCallback(() => {
    const historyIndex = currentRemoteFiles.historyIndex + 1;
    const path = currentRemoteFiles.history[historyIndex];
    if (path) {
      void loadDirectory({ path, mode: "history", historyIndex });
    }
  }, [currentRemoteFiles.history, currentRemoteFiles.historyIndex, loadDirectory]);

  const retry = useCallback(() => {
    void loadDirectory(
      failedNavigationRef.current ?? {
        path: currentRemoteFiles.directory?.path,
        mode: "replace",
      },
    );
  }, [currentRemoteFiles.directory?.path, loadDirectory]);

  return {
    directory: currentRemoteFiles.directory,
    error: currentRemoteFiles.error,
    isLoading: currentRemoteFiles.isLoading,
    isConnected: connectedSessionId !== null,
    canGoBack: currentRemoteFiles.historyIndex > 0,
    canGoForward:
      currentRemoteFiles.historyIndex >= 0 &&
      currentRemoteFiles.historyIndex < currentRemoteFiles.history.length - 1,
    goBack,
    goForward,
    openDirectory,
    refresh,
    retry,
  };
}

export type RemoteFilesController = ReturnType<typeof useRemoteFiles>;

function applySuccessfulNavigation(
  current: RemoteFilesState,
  navigation: NavigationRequest,
  resolvedPath: string,
) {
  switch (navigation.mode) {
    case "reset":
      return { history: [resolvedPath], historyIndex: 0 };
    case "replace": {
      if (current.historyIndex < 0) {
        return { history: [resolvedPath], historyIndex: 0 };
      }
      const history = [...current.history];
      history[current.historyIndex] = resolvedPath;
      return { history, historyIndex: current.historyIndex };
    }
    case "history": {
      const historyIndex = navigation.historyIndex ?? current.historyIndex;
      if (historyIndex < 0 || historyIndex >= current.history.length) {
        return { history: [resolvedPath], historyIndex: 0 };
      }
      const history = [...current.history];
      history[historyIndex] = resolvedPath;
      return { history, historyIndex };
    }
    case "push": {
      if (current.history[current.historyIndex] === resolvedPath) {
        return {
          history: current.history,
          historyIndex: current.historyIndex,
        };
      }
      const history = current.history.slice(0, current.historyIndex + 1);
      history.push(resolvedPath);
      return { history, historyIndex: history.length - 1 };
    }
  }
}
