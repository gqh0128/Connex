import { useCallback, useEffect, useRef, useState } from "react";

import { getCommandError } from "@/lib/tauri/errors";
import {
  createRemoteDirectory,
  createRemoteFile,
  deleteRemoteEntry,
  listRemoteDirectory,
  renameRemoteEntry,
} from "@/lib/tauri/sftp";
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

export function useRemoteFiles(session: SessionSnapshot | null, isEnabled: boolean) {
  const connectedSessionId =
    isEnabled && session?.state === "connected" ? session.id : null;
  const connectedSessionIdRef = useRef(connectedSessionId);
  connectedSessionIdRef.current = connectedSessionId;
  const requestIdsRef = useRef(new Map<string, number>());
  const failedNavigationsRef = useRef(new Map<string, NavigationRequest>());
  const initializedSessionIdsRef = useRef(new Set<string>());
  const [remoteFilesBySession, setRemoteFilesBySession] = useState(
    () => new Map<string, RemoteFilesState>(),
  );
  const currentRemoteFiles = connectedSessionId
    ? (remoteFilesBySession.get(connectedSessionId) ??
      createRemoteFilesState(connectedSessionId, true))
    : createRemoteFilesState(null, false);

  const loadDirectory = useCallback(
    async (sessionId: string, navigation: NavigationRequest) => {
      const requestId = (requestIdsRef.current.get(sessionId) ?? 0) + 1;
      requestIdsRef.current.set(sessionId, requestId);
      setRemoteFilesBySession((current) => {
        const sessionState =
          current.get(sessionId) ?? createRemoteFilesState(sessionId, false);
        const next = new Map(current);
        next.set(sessionId, {
          ...sessionState,
          error: null,
          isLoading: true,
        });
        return next;
      });

      try {
        const nextDirectory = await listRemoteDirectory(sessionId, navigation.path);
        if (requestIdsRef.current.get(sessionId) === requestId) {
          failedNavigationsRef.current.delete(sessionId);
          setRemoteFilesBySession((current) => {
            const sessionState =
              current.get(sessionId) ?? createRemoteFilesState(sessionId, true);
            const navigationState = applySuccessfulNavigation(
              sessionState,
              navigation,
              nextDirectory.path,
            );
            const next = new Map(current);
            next.set(sessionId, {
              ...sessionState,
              directory: nextDirectory,
              error: null,
              isLoading: false,
              ...navigationState,
            });

            return next;
          });
        }
      } catch (nextError) {
        if (requestIdsRef.current.get(sessionId) === requestId) {
          failedNavigationsRef.current.set(sessionId, navigation);
          setRemoteFilesBySession((current) => {
            const sessionState =
              current.get(sessionId) ?? createRemoteFilesState(sessionId, false);
            const next = new Map(current);
            next.set(sessionId, {
              ...sessionState,
              error: getCommandError(nextError),
              isLoading: false,
            });
            return next;
          });
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (
      connectedSessionId &&
      !initializedSessionIdsRef.current.has(connectedSessionId)
    ) {
      initializedSessionIdsRef.current.add(connectedSessionId);
      void loadDirectory(connectedSessionId, { mode: "reset" });
    }
  }, [connectedSessionId, loadDirectory]);

  const refresh = useCallback(() => {
    if (!connectedSessionId) {
      return;
    }
    void loadDirectory(connectedSessionId, {
      path: currentRemoteFiles.directory?.path,
      mode: "replace",
    });
  }, [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory]);

  const openDirectory = useCallback(
    (path: string) => {
      if (connectedSessionId) {
        void loadDirectory(connectedSessionId, { path, mode: "push" });
      }
    },
    [connectedSessionId, loadDirectory],
  );

  const goBack = useCallback(() => {
    const historyIndex = currentRemoteFiles.historyIndex - 1;
    const path = currentRemoteFiles.history[historyIndex];
    if (connectedSessionId && path) {
      void loadDirectory(connectedSessionId, { path, mode: "history", historyIndex });
    }
  }, [
    connectedSessionId,
    currentRemoteFiles.history,
    currentRemoteFiles.historyIndex,
    loadDirectory,
  ]);

  const goForward = useCallback(() => {
    const historyIndex = currentRemoteFiles.historyIndex + 1;
    const path = currentRemoteFiles.history[historyIndex];
    if (connectedSessionId && path) {
      void loadDirectory(connectedSessionId, { path, mode: "history", historyIndex });
    }
  }, [
    connectedSessionId,
    currentRemoteFiles.history,
    currentRemoteFiles.historyIndex,
    loadDirectory,
  ]);

  const retry = useCallback(() => {
    if (!connectedSessionId) {
      return;
    }
    void loadDirectory(
      connectedSessionId,
      failedNavigationsRef.current.get(connectedSessionId) ?? {
        path: currentRemoteFiles.directory?.path,
        mode: "replace",
      },
    );
  }, [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory]);

  const createDirectory = useCallback(
    async (name: string) => {
      const sessionId = connectedSessionId;
      const directoryPath = currentRemoteFiles.directory?.path;
      if (!sessionId || !directoryPath) {
        throw REMOTE_FILES_NOT_READY_ERROR;
      }

      const path = await createRemoteDirectory(sessionId, directoryPath, name);
      if (connectedSessionIdRef.current === sessionId) {
        await loadDirectory(sessionId, { path: directoryPath, mode: "replace" });
      }
      return path;
    },
    [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory],
  );

  const createFile = useCallback(
    async (name: string) => {
      const sessionId = connectedSessionId;
      const directoryPath = currentRemoteFiles.directory?.path;
      if (!sessionId || !directoryPath) {
        throw REMOTE_FILES_NOT_READY_ERROR;
      }

      const path = await createRemoteFile(sessionId, directoryPath, name);
      if (connectedSessionIdRef.current === sessionId) {
        await loadDirectory(sessionId, { path: directoryPath, mode: "replace" });
      }
      return path;
    },
    [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory],
  );

  const renameEntry = useCallback(
    async (path: string, newName: string) => {
      const sessionId = connectedSessionId;
      const directoryPath = currentRemoteFiles.directory?.path;
      if (!sessionId || !directoryPath) {
        throw REMOTE_FILES_NOT_READY_ERROR;
      }

      const nextPath = await renameRemoteEntry(sessionId, path, newName);
      if (connectedSessionIdRef.current === sessionId) {
        await loadDirectory(sessionId, { path: directoryPath, mode: "replace" });
      }
      return nextPath;
    },
    [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory],
  );

  const deleteEntry = useCallback(
    async (path: string) => {
      const sessionId = connectedSessionId;
      const directoryPath = currentRemoteFiles.directory?.path;
      if (!sessionId || !directoryPath) {
        throw REMOTE_FILES_NOT_READY_ERROR;
      }

      await deleteRemoteEntry(sessionId, path);
      if (connectedSessionIdRef.current === sessionId) {
        await loadDirectory(sessionId, { path: directoryPath, mode: "replace" });
      }
    },
    [connectedSessionId, currentRemoteFiles.directory?.path, loadDirectory],
  );

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
    createDirectory,
    createFile,
    renameEntry,
    deleteEntry,
    openDirectory,
    refresh,
    retry,
  };
}

export type RemoteFilesController = ReturnType<typeof useRemoteFiles>;

const REMOTE_FILES_NOT_READY_ERROR: CommandError = {
  code: "remote_files_not_ready",
  message: "远程文件尚未就绪，请等待目录加载完成后重试。",
  field: null,
};

function createRemoteFilesState(
  sessionId: string | null,
  isLoading: boolean,
): RemoteFilesState {
  return {
    sessionId,
    directory: null,
    error: null,
    isLoading,
    history: [],
    historyIndex: -1,
  };
}

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
