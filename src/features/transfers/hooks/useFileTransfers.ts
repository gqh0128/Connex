import { useCallback, useMemo, useState } from "react";

import { chooseLocalFilesForUpload } from "@/lib/tauri/dialogs";
import { getCommandError } from "@/lib/tauri/errors";
import { cancelRemoteFileUpload, uploadRemoteFile } from "@/lib/tauri/sftp";
import type { FileTransferTask } from "@/types/transfers";

const MAX_VISIBLE_TRANSFERS = 100;

type StartUploadsInput = {
  sessionId: string;
  connectionName: string;
  remoteDirectory: string;
  onCompleted: () => void;
};

export function useFileTransfers() {
  const [tasks, setTasks] = useState<FileTransferTask[]>([]);
  const [isSelectingFiles, setIsSelectingFiles] = useState(false);

  const updateTask = useCallback(
    (transferId: string, update: (task: FileTransferTask) => FileTransferTask) => {
      setTasks((current) =>
        current.map((task) => (task.id === transferId ? update(task) : task)),
      );
    },
    [],
  );

  const runUpload = useCallback(
    (
      task: FileTransferTask,
      localPath: string,
      remoteDirectory: string,
      sessionId: string,
      onCompleted: () => void,
    ) => {
      void uploadRemoteFile(
        {
          transferId: task.id,
          sessionId,
          localPath,
          remoteDirectory,
        },
        (progress) => {
          if (progress.transferId !== task.id) {
            return;
          }

          updateTask(task.id, (current) => ({
            ...current,
            transferredBytes: progress.transferredBytes,
            totalBytes: progress.totalBytes,
            bytesPerSecond: progress.bytesPerSecond,
          }));
        },
      )
        .then((result) => {
          updateTask(task.id, (current) => ({
            ...current,
            transferredBytes: result.totalBytes,
            totalBytes: result.totalBytes,
            bytesPerSecond: 0,
            status: "completed",
            isCancelling: false,
            finishedAt: Date.now(),
          }));
          onCompleted();
        })
        .catch((error: unknown) => {
          const commandError = getCommandError(error);
          const isCancelled = commandError.code === "transfer_cancelled";
          updateTask(task.id, (current) => ({
            ...current,
            bytesPerSecond: 0,
            status: isCancelled ? "cancelled" : "failed",
            isCancelling: false,
            errorMessage: isCancelled ? null : commandError.message,
            finishedAt: Date.now(),
          }));
        });
    },
    [updateTask],
  );

  const selectAndUpload = useCallback(
    async ({
      sessionId,
      connectionName,
      remoteDirectory,
      onCompleted,
    }: StartUploadsInput) => {
      if (isSelectingFiles) {
        return;
      }

      setIsSelectingFiles(true);
      try {
        const localPaths = await chooseLocalFilesForUpload();
        for (const localPath of localPaths) {
          const task: FileTransferTask = {
            id: crypto.randomUUID(),
            direction: "upload",
            fileName: fileNameFromPath(localPath),
            connectionName,
            transferredBytes: 0,
            totalBytes: 0,
            bytesPerSecond: 0,
            status: "running",
            isCancelling: false,
            errorMessage: null,
            startedAt: Date.now(),
            finishedAt: null,
          };
          setTasks((current) => [task, ...current].slice(0, MAX_VISIBLE_TRANSFERS));
          runUpload(task, localPath, remoteDirectory, sessionId, onCompleted);
        }
      } catch (error) {
        const commandError = getCommandError(error);
        const failedTask: FileTransferTask = {
          id: crypto.randomUUID(),
          direction: "upload",
          fileName: "选择本地文件",
          connectionName,
          transferredBytes: 0,
          totalBytes: 0,
          bytesPerSecond: 0,
          status: "failed",
          isCancelling: false,
          errorMessage: commandError.message,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        setTasks((current) => [failedTask, ...current].slice(0, MAX_VISIBLE_TRANSFERS));
      } finally {
        setIsSelectingFiles(false);
      }
    },
    [isSelectingFiles, runUpload],
  );

  const cancelUpload = useCallback(
    (transferId: string) => {
      updateTask(transferId, (task) => ({ ...task, isCancelling: true }));
      void cancelRemoteFileUpload(transferId).catch(() => {
        updateTask(transferId, (task) => ({ ...task, isCancelling: false }));
      });
    },
    [updateTask],
  );

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "running").length,
    [tasks],
  );

  return {
    tasks,
    activeCount,
    isSelectingFiles,
    selectAndUpload,
    cancelUpload,
  };
}

export type FileTransfersController = ReturnType<typeof useFileTransfers>;

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "未命名文件";
}
