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
};

export function useRemoteFiles(session: SessionSnapshot | null) {
  const connectedSessionId = session?.state === "connected" ? session.id : null;
  const requestIdRef = useRef(0);
  const failedPathRef = useRef<string | undefined>(undefined);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFilesState>({
    sessionId: null,
    directory: null,
    error: null,
    isLoading: false,
  });
  const currentRemoteFiles: RemoteFilesState =
    remoteFiles.sessionId === connectedSessionId
      ? remoteFiles
      : {
          sessionId: connectedSessionId,
          directory: null,
          error: null,
          isLoading: connectedSessionId !== null,
        };

  const loadDirectory = useCallback(
    async (path?: string) => {
      if (!connectedSessionId) {
        return;
      }

      const requestId = ++requestIdRef.current;
      setRemoteFiles((current) => ({
        sessionId: connectedSessionId,
        directory: current.sessionId === connectedSessionId ? current.directory : null,
        error: null,
        isLoading: true,
      }));

      try {
        const nextDirectory = await listRemoteDirectory(connectedSessionId, path);
        if (requestIdRef.current === requestId) {
          failedPathRef.current = undefined;
          setRemoteFiles({
            sessionId: connectedSessionId,
            directory: nextDirectory,
            error: null,
            isLoading: false,
          });
        }
      } catch (nextError) {
        if (requestIdRef.current === requestId) {
          failedPathRef.current = path;
          setRemoteFiles((current) => ({
            sessionId: connectedSessionId,
            directory:
              current.sessionId === connectedSessionId ? current.directory : null,
            error: getCommandError(nextError),
            isLoading: false,
          }));
        }
      }
    },
    [connectedSessionId],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    failedPathRef.current = undefined;

    if (connectedSessionId) {
      void loadDirectory();
    }

    return () => {
      requestIdRef.current += 1;
    };
  }, [connectedSessionId, loadDirectory]);

  const refresh = useCallback(() => {
    void loadDirectory(currentRemoteFiles.directory?.path);
  }, [currentRemoteFiles.directory?.path, loadDirectory]);

  const openDirectory = useCallback(
    (path: string) => {
      void loadDirectory(path);
    },
    [loadDirectory],
  );

  const retry = useCallback(() => {
    void loadDirectory(failedPathRef.current ?? currentRemoteFiles.directory?.path);
  }, [currentRemoteFiles.directory?.path, loadDirectory]);

  return {
    directory: currentRemoteFiles.directory,
    error: currentRemoteFiles.error,
    isLoading: currentRemoteFiles.isLoading,
    isConnected: connectedSessionId !== null,
    openDirectory,
    refresh,
    retry,
  };
}

export type RemoteFilesController = ReturnType<typeof useRemoteFiles>;
