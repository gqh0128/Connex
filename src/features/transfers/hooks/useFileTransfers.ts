import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCommandError } from "@/lib/tauri/errors";
import {
  attachRemoteFileTransfers,
  cancelRemoteFileTransfer,
  downloadRemoteFile,
  pauseRemoteFileTransfer,
  selectLocalDownloadFolder,
  selectLocalDownloadTarget,
  selectLocalUploadFolder,
  selectLocalUploadFiles,
  uploadRemoteFile,
} from "@/lib/tauri/sftp";
import type { CommandError } from "@/types/ipc";
import type { RemoteFileEntry, RemoteFileTransferProgress } from "@/types/sftp";
import type { FileTransferTask } from "@/types/transfers";

import { getQueueEtaSeconds, sortTransferTasks } from "../transferMetrics";
import {
  canManuallyRetryTransfer,
  getAutomaticRetryDelayMs,
  TRANSFER_CONCURRENCY_LIMIT,
  TRANSFER_HISTORY_LIMIT,
  TRANSFER_MAX_ATTEMPTS,
} from "../transferPolicy";

type StartUploadsInput = {
  sessionId: string;
  connectionName: string;
  remoteDirectory: string;
  onCompleted: () => void;
};

type StartDownloadInput = {
  sessionId: string;
  connectionName: string;
  entry: RemoteFileEntry;
};

type StartDownloadFolderInput = StartDownloadInput;

type UploadTransferSpec = {
  direction: "upload";
  sessionId: string;
  onCompleted: () => void;
};

type DownloadTransferSpec = {
  direction: "download";
  sessionId: string;
};

type TransferSpec = UploadTransferSpec | DownloadTransferSpec;

type TransferCancellationRequest = {
  runGeneration: number;
  phase: "requested" | "accepted" | "releaseFailed";
};

type TransferPauseRequest = {
  runGeneration: number;
  phase: "requested" | "accepted";
};

type PreparedTransfer = {
  task: FileTransferTask;
  spec: TransferSpec | null;
};

export function useFileTransfers() {
  const [tasks, setTasks] = useState<FileTransferTask[]>([]);
  const [isSelectingFiles, setIsSelectingFiles] = useState(false);
  const [isSelectingDownload, setIsSelectingDownload] = useState(false);
  const [schedulerTick, setSchedulerTick] = useState(0);
  const tasksRef = useRef<FileTransferTask[]>([]);
  const specsRef = useRef(new Map<string, TransferSpec>());
  const activeRunsRef = useRef(new Set<string>());
  const cancellationRequestsRef = useRef(
    new Map<string, TransferCancellationRequest>(),
  );
  const pauseRequestsRef = useRef(new Map<string, TransferPauseRequest>());
  const queueOrderRef = useRef(0);
  const isSelectingLocalPathRef = useRef(false);

  const commitTasks = useCallback(
    (update: (current: FileTransferTask[]) => FileTransferTask[]) => {
      const current = tasksRef.current;
      const updated = update(current);
      const next = pruneTransferHistory(updated);
      if (next === current) {
        return current;
      }

      tasksRef.current = next;
      setTasks(next);

      const retainedIds = new Set(next.map((task) => task.id));
      for (const transferId of specsRef.current.keys()) {
        if (!retainedIds.has(transferId)) {
          specsRef.current.delete(transferId);
        }
      }
      return next;
    },
    [],
  );

  const updateTask = useCallback(
    (transferId: string, update: (task: FileTransferTask) => FileTransferTask) => {
      let didUpdate = false;
      commitTasks((current) => {
        const taskIndex = current.findIndex((task) => task.id === transferId);
        if (taskIndex === -1) {
          return current;
        }

        const task = current[taskIndex];
        const nextTask = update(task);
        if (nextTask === task) {
          return current;
        }

        const next = [...current];
        next[taskIndex] = nextTask;
        didUpdate = true;
        return next;
      });
      return didUpdate;
    },
    [commitTasks],
  );

  const addPreparedTransfers = useCallback(
    (preparedTransfers: PreparedTransfer[]) => {
      if (preparedTransfers.length === 0) {
        return;
      }

      for (const { task, spec } of preparedTransfers) {
        if (spec) {
          specsRef.current.set(task.id, spec);
        }
      }
      commitTasks((current) => [
        ...preparedTransfers.map(({ task }) => task),
        ...current,
      ]);
    },
    [commitTasks],
  );

  const executeTransfer = useCallback(
    async (transferId: string, attempt: number, runGeneration: number) => {
      const spec = specsRef.current.get(transferId);
      if (!spec) {
        activeRunsRef.current.delete(transferId);
        cancellationRequestsRef.current.delete(transferId);
        pauseRequestsRef.current.delete(transferId);
        updateTask(transferId, (task) =>
          isRunningAttempt(task, attempt, runGeneration)
            ? {
                ...task,
                status: "failed",
                canRetry: false,
                isPausing: false,
                isResuming: false,
                errorMessage: "传输任务信息已经失效，请重新选择文件。",
                finishedAt: Date.now(),
              }
            : task,
        );
        setSchedulerTick((current) => current + 1);
        return;
      }

      const onProgress = (progress: RemoteFileTransferProgress) => {
        if (progress.transferId !== transferId) {
          return;
        }

        updateTask(transferId, (task) => {
          if (!isRunningAttempt(task, attempt, runGeneration)) {
            return task;
          }

          return {
            ...task,
            transferredBytes: progress.transferredBytes,
            totalBytes: progress.totalBytes,
            bytesPerSecond: progress.bytesPerSecond,
          };
        });
      };

      try {
        const result =
          spec.direction === "upload"
            ? await uploadRemoteFile(
                {
                  transferId,
                },
                onProgress,
              )
            : await downloadRemoteFile(
                {
                  transferId,
                },
                onProgress,
              );

        const didComplete = updateTask(transferId, (task) => {
          if (!isRunningAttempt(task, attempt, runGeneration)) {
            return task;
          }

          return {
            ...task,
            transferredBytes: result.totalBytes,
            totalBytes: result.totalBytes,
            status: "completed",
            nextRetryAt: null,
            canRetry: false,
            isPausing: false,
            isResuming: false,
            isCancelling: false,
            isReleaseBlocked: false,
            errorMessage: null,
            finishedAt: Date.now(),
          };
        });
        if (didComplete) {
          specsRef.current.delete(transferId);
        }
        if (didComplete && spec.direction === "upload") {
          try {
            spec.onCompleted();
          } catch {
            // Directory refresh is best effort and must not turn a completed upload into a failure.
          }
        }
      } catch (error: unknown) {
        const commandError = getCommandError(error);
        const cancellationRequest = cancellationRequestsRef.current.get(transferId);
        const pauseRequest = pauseRequestsRef.current.get(transferId);
        const isCurrentCancellation =
          cancellationRequest?.runGeneration === runGeneration;
        handleTransferFailure({
          transferId,
          attempt,
          runGeneration,
          commandError,
          isCancellationAccepted:
            isCurrentCancellation && cancellationRequest?.phase === "accepted",
          isCancellationPending:
            isCurrentCancellation && cancellationRequest?.phase === "requested",
          isPauseRequested: pauseRequest?.runGeneration === runGeneration,
          updateTask,
          specs: specsRef.current,
        });
        if (commandError.code === "transfer_cancelled" && isCurrentCancellation) {
          cancellationRequestsRef.current.delete(transferId);
        }
        if (
          commandError.code === "transfer_paused" &&
          pauseRequest?.runGeneration === runGeneration
        ) {
          pauseRequestsRef.current.delete(transferId);
        }
      } finally {
        activeRunsRef.current.delete(transferId);
        setSchedulerTick((current) => current + 1);
      }
    },
    [updateTask],
  );

  useEffect(() => {
    const now = Date.now();
    const starts: Array<{ id: string; attempt: number; runGeneration: number }> = [];
    commitTasks((current) => {
      const availableSlots = TRANSFER_CONCURRENCY_LIMIT - activeRunsRef.current.size;
      if (availableSlots <= 0) {
        return current;
      }

      const runnableTasks = current
        .filter(
          (task) =>
            !cancellationRequestsRef.current.has(task.id) &&
            !pauseRequestsRef.current.has(task.id) &&
            (task.status === "queued" ||
              (task.status === "retrying" &&
                task.nextRetryAt !== null &&
                task.nextRetryAt <= now)),
        )
        .sort((left, right) => left.queueOrder - right.queueOrder)
        .slice(0, availableSlots);
      if (runnableTasks.length === 0) {
        return current;
      }

      for (const task of runnableTasks) {
        const start = {
          id: task.id,
          attempt: task.isResuming ? task.attempt : task.attempt + 1,
          runGeneration: task.runGeneration + 1,
        };
        starts.push(start);
        activeRunsRef.current.add(task.id);
      }
      const startsById = new Map(starts.map((start) => [start.id, start]));
      return current.map((task) => {
        const start = startsById.get(task.id);
        if (!start) {
          return task;
        }

        return {
          ...task,
          status: "running",
          attempt: start.attempt,
          runGeneration: start.runGeneration,
          nextRetryAt: null,
          isPausing: false,
          isResuming: false,
          isCancelling: false,
          isReleaseBlocked: false,
          errorMessage: null,
          startedAt: now,
          finishedAt: null,
        };
      });
    });

    for (const { id, attempt, runGeneration } of starts) {
      void executeTransfer(id, attempt, runGeneration);
    }
  }, [commitTasks, executeTransfer, schedulerTick, tasks]);

  const nextRetryAt = useMemo(
    () =>
      tasks.reduce<number | null>((nearest, task) => {
        if (task.status !== "retrying" || task.nextRetryAt === null) {
          return nearest;
        }
        return nearest === null
          ? task.nextRetryAt
          : Math.min(nearest, task.nextRetryAt);
      }, null),
    [tasks],
  );

  useEffect(() => {
    if (nextRetryAt === null) {
      return;
    }

    const timeout = window.setTimeout(
      () => setSchedulerTick((current) => current + 1),
      Math.max(0, nextRetryAt - Date.now()) + 20,
    );
    return () => window.clearTimeout(timeout);
  }, [nextRetryAt]);

  const selectAndUpload = useCallback(
    async ({
      sessionId,
      connectionName,
      remoteDirectory,
      onCompleted,
    }: StartUploadsInput) => {
      if (isSelectingLocalPathRef.current) {
        return;
      }

      isSelectingLocalPathRef.current = true;
      setIsSelectingFiles(true);
      try {
        const selections = await selectLocalUploadFiles({
          sessionId,
          remoteDirectory,
        });
        if (selections.length === 0) {
          return;
        }

        const transferIds = selections.map((selection) => selection.transferId);
        try {
          await attachRemoteFileTransfers({ transferIds });
        } catch (error: unknown) {
          await releaseRemoteFileTransfers(transferIds);
          throw error;
        }
        const preparedTransfers = selections.map((selection): PreparedTransfer => {
          const createdAt = Date.now();
          const queueOrder = ++queueOrderRef.current;
          return {
            task: createTransferTask({
              id: selection.transferId,
              direction: "upload",
              fileName: selection.fileName,
              connectionName,
              totalBytes: selection.totalBytes,
              queueOrder,
              createdAt,
            }),
            spec: {
              direction: "upload",
              sessionId,
              onCompleted,
            },
          };
        });
        addPreparedTransfers(preparedTransfers);
      } catch (error: unknown) {
        const createdAt = Date.now();
        addPreparedTransfers([
          {
            task: createFailedSelectionTask({
              id: crypto.randomUUID(),
              direction: "upload",
              fileName: "选择本地文件",
              connectionName,
              commandError: getCommandError(error),
              queueOrder: ++queueOrderRef.current,
              createdAt,
            }),
            spec: null,
          },
        ]);
      } finally {
        isSelectingLocalPathRef.current = false;
        setIsSelectingFiles(false);
      }
    },
    [addPreparedTransfers],
  );

  const selectAndUploadFolder = useCallback(
    async ({
      sessionId,
      connectionName,
      remoteDirectory,
      onCompleted,
    }: StartUploadsInput) => {
      if (isSelectingLocalPathRef.current) {
        return;
      }

      isSelectingLocalPathRef.current = true;
      setIsSelectingFiles(true);
      try {
        const selection = await selectLocalUploadFolder({
          sessionId,
          remoteDirectory,
        });
        if (!selection) {
          return;
        }

        onCompleted();
        const transferIds = selection.files.map((file) => file.transferId);
        if (transferIds.length === 0) {
          const createdAt = Date.now();
          addPreparedTransfers([
            {
              task: createCompletedFolderTask({
                id: crypto.randomUUID(),
                direction: "upload",
                fileName: `${selection.folderName}/`,
                connectionName,
                totalBytes: 0,
                queueOrder: ++queueOrderRef.current,
                createdAt,
              }),
              spec: null,
            },
          ]);
          return;
        }

        try {
          await attachRemoteFileTransfers({ transferIds });
        } catch (error: unknown) {
          await releaseRemoteFileTransfers(transferIds);
          throw error;
        }
        addPreparedTransfers(
          selection.files.map((file): PreparedTransfer => {
            const createdAt = Date.now();
            return {
              task: createTransferTask({
                id: file.transferId,
                direction: "upload",
                fileName: file.relativePath,
                connectionName,
                totalBytes: file.totalBytes,
                queueOrder: ++queueOrderRef.current,
                createdAt,
              }),
              spec: {
                direction: "upload",
                sessionId,
                onCompleted: () => undefined,
              },
            };
          }),
        );
      } catch (error: unknown) {
        const createdAt = Date.now();
        addPreparedTransfers([
          {
            task: createFailedSelectionTask({
              id: crypto.randomUUID(),
              direction: "upload",
              fileName: "选择本地文件夹",
              connectionName,
              commandError: getCommandError(error),
              queueOrder: ++queueOrderRef.current,
              createdAt,
            }),
            spec: null,
          },
        ]);
      } finally {
        isSelectingLocalPathRef.current = false;
        setIsSelectingFiles(false);
      }
    },
    [addPreparedTransfers],
  );

  const selectAndDownload = useCallback(
    async ({ sessionId, connectionName, entry }: StartDownloadInput) => {
      if (entry.kind !== "file" || isSelectingLocalPathRef.current) {
        return;
      }

      isSelectingLocalPathRef.current = true;
      setIsSelectingDownload(true);
      try {
        const selection = await selectLocalDownloadTarget({
          sessionId,
          remotePath: entry.path,
          defaultFileName: entry.name,
        });
        if (!selection) {
          return;
        }

        try {
          await attachRemoteFileTransfers({ transferIds: [selection.transferId] });
        } catch (error: unknown) {
          await releaseRemoteFileTransfers([selection.transferId]);
          throw error;
        }

        const createdAt = Date.now();
        const task = createTransferTask({
          id: selection.transferId,
          direction: "download",
          fileName: entry.name,
          connectionName,
          totalBytes: selection.totalBytes,
          queueOrder: ++queueOrderRef.current,
          createdAt,
        });
        addPreparedTransfers([
          {
            task,
            spec: {
              direction: "download",
              sessionId,
            },
          },
        ]);
      } catch (error: unknown) {
        const createdAt = Date.now();
        addPreparedTransfers([
          {
            task: createFailedSelectionTask({
              id: crypto.randomUUID(),
              direction: "download",
              fileName: entry.name,
              connectionName,
              commandError: getCommandError(error),
              queueOrder: ++queueOrderRef.current,
              createdAt,
            }),
            spec: null,
          },
        ]);
      } finally {
        isSelectingLocalPathRef.current = false;
        setIsSelectingDownload(false);
      }
    },
    [addPreparedTransfers],
  );

  const selectAndDownloadFolder = useCallback(
    async ({ sessionId, connectionName, entry }: StartDownloadFolderInput) => {
      if (entry.kind !== "directory" || isSelectingLocalPathRef.current) {
        return;
      }

      isSelectingLocalPathRef.current = true;
      setIsSelectingDownload(true);
      try {
        const selection = await selectLocalDownloadFolder({
          sessionId,
          remotePath: entry.path,
        });
        if (!selection) {
          return;
        }

        const transferIds = selection.files.map((file) => file.transferId);
        if (transferIds.length === 0) {
          const createdAt = Date.now();
          addPreparedTransfers([
            {
              task: createCompletedFolderTask({
                id: crypto.randomUUID(),
                direction: "download",
                fileName: `${selection.folderName}/`,
                connectionName,
                totalBytes: 0,
                queueOrder: ++queueOrderRef.current,
                createdAt,
              }),
              spec: null,
            },
          ]);
          return;
        }

        try {
          await attachRemoteFileTransfers({ transferIds });
        } catch (error: unknown) {
          await releaseRemoteFileTransfers(transferIds);
          throw error;
        }
        addPreparedTransfers(
          selection.files.map((file): PreparedTransfer => {
            const createdAt = Date.now();
            return {
              task: createTransferTask({
                id: file.transferId,
                direction: "download",
                fileName: file.relativePath,
                connectionName,
                totalBytes: file.totalBytes,
                queueOrder: ++queueOrderRef.current,
                createdAt,
              }),
              spec: {
                direction: "download",
                sessionId,
              },
            };
          }),
        );
      } catch (error: unknown) {
        const createdAt = Date.now();
        addPreparedTransfers([
          {
            task: createFailedSelectionTask({
              id: crypto.randomUUID(),
              direction: "download",
              fileName: entry.name,
              connectionName,
              commandError: getCommandError(error),
              queueOrder: ++queueOrderRef.current,
              createdAt,
            }),
            spec: null,
          },
        ]);
      } finally {
        isSelectingLocalPathRef.current = false;
        setIsSelectingDownload(false);
      }
    },
    [addPreparedTransfers],
  );

  const pauseTransfer = useCallback(
    (transferId: string) => {
      const task = tasksRef.current.find((candidate) => candidate.id === transferId);
      if (
        !task ||
        !["queued", "retrying", "running"].includes(task.status) ||
        task.isCancelling ||
        task.isPausing
      ) {
        return;
      }

      if (task.status !== "running" && !activeRunsRef.current.has(transferId)) {
        updateTask(transferId, (current) =>
          current.status === "queued" || current.status === "retrying"
            ? {
                ...current,
                status: "paused",
                bytesPerSecond: 0,
                nextRetryAt: null,
                isPausing: false,
                isResuming: false,
                errorMessage: null,
                finishedAt: null,
              }
            : current,
        );
        return;
      }

      const runGeneration = task.runGeneration;
      pauseRequestsRef.current.set(transferId, {
        runGeneration,
        phase: "requested",
      });
      updateTask(transferId, (current) =>
        isRunningGeneration(current, runGeneration)
          ? { ...current, isPausing: true, errorMessage: null }
          : current,
      );
      void pauseRemoteFileTransfer(transferId)
        .then((status) => {
          const request = pauseRequestsRef.current.get(transferId);
          if (
            request?.runGeneration !== runGeneration ||
            request.phase !== "requested"
          ) {
            return;
          }
          if (status === "accepted") {
            pauseRequestsRef.current.set(transferId, {
              runGeneration,
              phase: "accepted",
            });
            return;
          }

          pauseRequestsRef.current.delete(transferId);
          updateTask(transferId, (current) =>
            isRunningGeneration(current, runGeneration)
              ? {
                  ...current,
                  isPausing: false,
                  errorMessage:
                    status === "tooLate"
                      ? "传输已进入最终写入阶段，当前无法暂停。"
                      : "传输任务已经结束，当前无法暂停。",
                }
              : current,
          );
        })
        .catch((error: unknown) => {
          const request = pauseRequestsRef.current.get(transferId);
          if (request?.runGeneration !== runGeneration) {
            return;
          }
          pauseRequestsRef.current.delete(transferId);
          const commandError = getCommandError(error);
          updateTask(transferId, (current) =>
            isRunningGeneration(current, runGeneration)
              ? {
                  ...current,
                  isPausing: false,
                  errorMessage: `暂停失败：${commandError.message}`,
                }
              : current,
          );
        });
    },
    [updateTask],
  );

  const resumeTransfer = useCallback(
    (transferId: string) => {
      const task = tasksRef.current.find((candidate) => candidate.id === transferId);
      if (!task || task.status !== "paused" || task.isCancelling || task.isPausing) {
        return;
      }
      pauseRequestsRef.current.delete(transferId);
      updateTask(transferId, (current) =>
        current.status === "paused"
          ? {
              ...current,
              status: "queued",
              bytesPerSecond: 0,
              nextRetryAt: null,
              isPausing: false,
              isCancelling: false,
              isReleaseBlocked: false,
              errorMessage: null,
              queueOrder: ++queueOrderRef.current,
              finishedAt: null,
            }
          : current,
      );
    },
    [updateTask],
  );

  const cancelTransfer = useCallback(
    (transferId: string) => {
      const task = tasksRef.current.find((candidate) => candidate.id === transferId);
      if (
        !task ||
        !["queued", "retrying", "running", "paused"].includes(task.status) ||
        task.isPausing
      ) {
        return;
      }

      const runGeneration = task.runGeneration;
      cancellationRequestsRef.current.set(transferId, {
        runGeneration,
        phase: "requested",
      });
      updateTask(transferId, (current) =>
        current.runGeneration === runGeneration &&
        ["queued", "retrying", "running", "paused"].includes(current.status)
          ? {
              ...current,
              isCancelling: true,
              isReleaseBlocked: false,
              errorMessage: null,
            }
          : current,
      );
      void cancelRemoteFileTransfer(transferId)
        .then((status) => {
          const request = cancellationRequestsRef.current.get(transferId);
          if (
            request?.runGeneration !== runGeneration ||
            request.phase !== "requested"
          ) {
            return;
          }

          const currentTask = tasksRef.current.find(
            (candidate) => candidate.id === transferId,
          );
          const isNowWaiting =
            currentTask?.runGeneration === runGeneration &&
            !activeRunsRef.current.has(transferId) &&
            (currentTask.status === "queued" ||
              currentTask.status === "retrying" ||
              currentTask.status === "paused");
          if (status === "accepted" || (status === "notFound" && isNowWaiting)) {
            cancellationRequestsRef.current.set(transferId, {
              runGeneration,
              phase: "accepted",
            });
            const didCancel = updateTask(transferId, (current) =>
              current.runGeneration === runGeneration &&
              ["queued", "retrying", "running", "paused", "failed"].includes(
                current.status,
              )
                ? {
                    ...current,
                    bytesPerSecond: 0,
                    status: "cancelled",
                    nextRetryAt: null,
                    canRetry: false,
                    isPausing: false,
                    isResuming: false,
                    isCancelling: false,
                    isReleaseBlocked: false,
                    errorMessage: null,
                    finishedAt: Date.now(),
                  }
                : current,
            );
            if (didCancel) {
              specsRef.current.delete(transferId);
            }
            cancellationRequestsRef.current.delete(transferId);
            setSchedulerTick((current) => current + 1);
            return;
          }

          if (status === "tooLate" && isNowWaiting) {
            cancellationRequestsRef.current.set(transferId, {
              runGeneration,
              phase: "releaseFailed",
            });
          } else {
            cancellationRequestsRef.current.delete(transferId);
          }
          updateTask(transferId, (current) => {
            if (current.runGeneration !== runGeneration) {
              return current;
            }
            const canShowReleaseFailure =
              current.status === "queued" ||
              current.status === "retrying" ||
              current.status === "running" ||
              current.status === "paused" ||
              (current.status === "failed" &&
                current.canRetry &&
                specsRef.current.has(transferId));
            if (!canShowReleaseFailure) {
              return current;
            }

            return {
              ...current,
              isCancelling: false,
              isReleaseBlocked: status === "tooLate" && isNowWaiting,
              errorMessage:
                status === "tooLate"
                  ? "传输已进入最终写入阶段，当前无法取消；可再次尝试释放任务。"
                  : "传输任务已经结束，当前无法取消。",
            };
          });
          setSchedulerTick((current) => current + 1);
        })
        .catch((error: unknown) => {
          const request = cancellationRequestsRef.current.get(transferId);
          if (
            request?.runGeneration !== runGeneration ||
            request.phase !== "requested"
          ) {
            return;
          }

          const currentTask = tasksRef.current.find(
            (candidate) => candidate.id === transferId,
          );
          const shouldHoldForRelease =
            currentTask?.runGeneration === runGeneration &&
            !activeRunsRef.current.has(transferId) &&
            (currentTask.status === "queued" ||
              currentTask.status === "retrying" ||
              currentTask.status === "paused");
          if (shouldHoldForRelease) {
            cancellationRequestsRef.current.set(transferId, {
              runGeneration,
              phase: "releaseFailed",
            });
          } else {
            cancellationRequestsRef.current.delete(transferId);
          }
          const commandError = getCommandError(error);
          updateTask(transferId, (current) => {
            if (current.runGeneration !== runGeneration) {
              return current;
            }
            const canShowReleaseFailure =
              current.status === "queued" ||
              current.status === "retrying" ||
              current.status === "running" ||
              current.status === "paused" ||
              (current.status === "failed" &&
                current.canRetry &&
                specsRef.current.has(transferId));
            if (!canShowReleaseFailure) {
              return current;
            }

            return {
              ...current,
              isCancelling: false,
              isReleaseBlocked: shouldHoldForRelease,
              errorMessage: `取消失败：${commandError.message}。可再次尝试释放任务。`,
            };
          });
          setSchedulerTick((current) => current + 1);
        });
    },
    [updateTask],
  );

  const retryTransfer = useCallback(
    (transferId: string) => {
      const task = tasksRef.current.find((candidate) => candidate.id === transferId);
      if (
        !task ||
        task.status !== "failed" ||
        !task.canRetry ||
        task.isCancelling ||
        cancellationRequestsRef.current.has(transferId) ||
        !specsRef.current.has(transferId)
      ) {
        return;
      }

      updateTask(transferId, (current) => ({
        ...current,
        status: "queued",
        transferredBytes: 0,
        bytesPerSecond: 0,
        attempt: 0,
        nextRetryAt: null,
        canRetry: false,
        isPausing: false,
        isResuming: false,
        isCancelling: false,
        isReleaseBlocked: false,
        errorMessage: null,
        queueOrder: ++queueOrderRef.current,
        startedAt: null,
        finishedAt: null,
      }));
    },
    [updateTask],
  );

  const discardTransfer = useCallback(
    (transferId: string) => {
      const task = tasksRef.current.find((candidate) => candidate.id === transferId);
      if (
        !task ||
        task.status !== "failed" ||
        !task.canRetry ||
        task.isCancelling ||
        !specsRef.current.has(transferId)
      ) {
        return;
      }

      updateTask(transferId, (current) =>
        current.status === "failed"
          ? { ...current, isCancelling: true, isReleaseBlocked: false }
          : current,
      );
      void cancelRemoteFileTransfer(transferId)
        .then((status) => {
          if (status === "tooLate") {
            updateTask(transferId, (current) =>
              current.status === "failed"
                ? {
                    ...current,
                    isCancelling: false,
                    isReleaseBlocked: false,
                    errorMessage: "传输仍在结束，暂时无法放弃重试。",
                  }
                : current,
            );
            return;
          }

          specsRef.current.delete(transferId);
          updateTask(transferId, (current) =>
            current.status === "failed"
              ? {
                  ...current,
                  canRetry: false,
                  isCancelling: false,
                  isReleaseBlocked: false,
                }
              : current,
          );
        })
        .catch((error: unknown) => {
          const commandError = getCommandError(error);
          updateTask(transferId, (current) =>
            current.status === "failed"
              ? {
                  ...current,
                  isCancelling: false,
                  isReleaseBlocked: false,
                  errorMessage: `释放重试任务失败：${commandError.message}`,
                }
              : current,
          );
        });
    },
    [updateTask],
  );

  const cancelTransfersForSession = useCallback(
    (sessionId: string) => {
      const transferIds = new Set(
        [...specsRef.current.entries()]
          .filter(([, spec]) => spec.sessionId === sessionId)
          .map(([transferId]) => transferId),
      );
      if (transferIds.size === 0) {
        return;
      }

      for (const transferId of transferIds) {
        cancellationRequestsRef.current.delete(transferId);
        pauseRequestsRef.current.delete(transferId);
        specsRef.current.delete(transferId);
        void cancelRemoteFileTransfer(transferId).catch(() => {
          // Closing the SSH session is the authoritative backend cleanup path.
        });
      }
      commitTasks((current) =>
        current.map((task) =>
          transferIds.has(task.id) &&
          (isPendingTransfer(task) || (task.status === "failed" && task.canRetry))
            ? {
                ...task,
                bytesPerSecond: 0,
                status: "cancelled",
                nextRetryAt: null,
                canRetry: false,
                isPausing: false,
                isResuming: false,
                isCancelling: false,
                isReleaseBlocked: false,
                errorMessage: null,
                finishedAt: Date.now(),
              }
            : task,
        ),
      );
    },
    [commitTasks],
  );

  const sortedTasks = useMemo(() => sortTransferTasks(tasks), [tasks]);
  const runningCount = useMemo(
    () => tasks.filter((task) => task.status === "running").length,
    [tasks],
  );
  const waitingCount = useMemo(
    () =>
      tasks.filter((task) => task.status === "queued" || task.status === "retrying")
        .length,
    [tasks],
  );
  const failedCount = useMemo(
    () => tasks.filter((task) => task.status === "failed").length,
    [tasks],
  );
  const pausedCount = useMemo(
    () => tasks.filter((task) => task.status === "paused").length,
    [tasks],
  );
  const uploadCount = useMemo(
    () =>
      tasks.filter((task) => task.direction === "upload" && isPendingTransfer(task))
        .length,
    [tasks],
  );
  const downloadCount = useMemo(
    () =>
      tasks.filter((task) => task.direction === "download" && isPendingTransfer(task))
        .length,
    [tasks],
  );
  const queueEtaSeconds = useMemo(() => getQueueEtaSeconds(tasks), [tasks]);

  return {
    tasks: sortedTasks,
    activeCount: runningCount,
    runningCount,
    waitingCount,
    pausedCount,
    failedCount,
    uploadCount,
    downloadCount,
    concurrencyLimit: TRANSFER_CONCURRENCY_LIMIT,
    queueEtaSeconds,
    isSelectingFiles,
    isSelectingDownload,
    selectAndUpload,
    selectAndUploadFolder,
    selectAndDownload,
    selectAndDownloadFolder,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    cancelTransfersForSession,
    retryTransfer,
    discardTransfer,
  };
}

export type FileTransfersController = ReturnType<typeof useFileTransfers>;

type CreateTransferTaskInput = Pick<
  FileTransferTask,
  | "id"
  | "direction"
  | "fileName"
  | "connectionName"
  | "totalBytes"
  | "queueOrder"
  | "createdAt"
>;

function createTransferTask(input: CreateTransferTaskInput): FileTransferTask {
  return {
    ...input,
    transferredBytes: 0,
    bytesPerSecond: 0,
    status: "queued",
    attempt: 0,
    runGeneration: 0,
    maxAttempts: TRANSFER_MAX_ATTEMPTS,
    nextRetryAt: null,
    canRetry: false,
    isPausing: false,
    isResuming: false,
    isCancelling: false,
    isReleaseBlocked: false,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
  };
}

function createCompletedFolderTask(input: CreateTransferTaskInput): FileTransferTask {
  return {
    ...createTransferTask(input),
    status: "completed",
    transferredBytes: input.totalBytes ?? 0,
    finishedAt: Date.now(),
  };
}

function createFailedSelectionTask({
  commandError,
  ...input
}: Omit<CreateTransferTaskInput, "totalBytes"> & {
  commandError: CommandError;
}): FileTransferTask {
  return {
    ...createTransferTask({ ...input, totalBytes: null }),
    status: "failed",
    errorMessage: commandError.message,
    finishedAt: Date.now(),
  };
}

type HandleTransferFailureInput = {
  transferId: string;
  attempt: number;
  runGeneration: number;
  commandError: CommandError;
  isCancellationAccepted: boolean;
  isCancellationPending: boolean;
  isPauseRequested: boolean;
  updateTask: (
    transferId: string,
    update: (task: FileTransferTask) => FileTransferTask,
  ) => boolean;
  specs: Map<string, TransferSpec>;
};

function handleTransferFailure({
  transferId,
  attempt,
  runGeneration,
  commandError,
  isCancellationAccepted,
  isCancellationPending,
  isPauseRequested,
  updateTask,
  specs,
}: HandleTransferFailureInput) {
  if (isPauseRequested && commandError.code === "transfer_paused") {
    updateTask(transferId, (task) =>
      isRunningAttempt(task, attempt, runGeneration)
        ? {
            ...task,
            bytesPerSecond: 0,
            status: "paused",
            nextRetryAt: null,
            canRetry: false,
            isPausing: false,
            isResuming: true,
            isCancelling: false,
            isReleaseBlocked: false,
            errorMessage: null,
            finishedAt: null,
          }
        : task,
    );
    return;
  }

  if (isCancellationAccepted || commandError.code === "transfer_cancelled") {
    const didCancel = updateTask(transferId, (task) =>
      isRunningAttempt(task, attempt, runGeneration)
        ? {
            ...task,
            bytesPerSecond: 0,
            status: "cancelled",
            nextRetryAt: null,
            canRetry: false,
            isPausing: false,
            isResuming: false,
            isCancelling: false,
            isReleaseBlocked: false,
            errorMessage: null,
            finishedAt: Date.now(),
          }
        : task,
    );
    if (didCancel) {
      specs.delete(transferId);
    }
    return;
  }

  const retryDelay = getAutomaticRetryDelayMs(commandError.code, attempt);
  if (attempt < TRANSFER_MAX_ATTEMPTS && retryDelay !== null) {
    updateTask(transferId, (task) =>
      isRunningAttempt(task, attempt, runGeneration)
        ? {
            ...task,
            transferredBytes: 0,
            bytesPerSecond: 0,
            status: "retrying",
            nextRetryAt: Date.now() + retryDelay,
            canRetry: true,
            isPausing: false,
            isResuming: false,
            isCancelling: isCancellationPending,
            errorMessage: commandError.message,
            finishedAt: null,
          }
        : task,
    );
    return;
  }

  const canRetry = canManuallyRetryTransfer(commandError.code);
  const didFail = updateTask(transferId, (task) =>
    isRunningAttempt(task, attempt, runGeneration)
      ? {
          ...task,
          bytesPerSecond: 0,
          status: "failed",
          nextRetryAt: null,
          canRetry,
          isPausing: false,
          isResuming: false,
          isCancelling: canRetry && isCancellationPending,
          errorMessage: commandError.message,
          finishedAt: Date.now(),
        }
      : task,
  );
  if (didFail && !canRetry) {
    specs.delete(transferId);
  }
}

function pruneTransferHistory(tasks: FileTransferTask[]) {
  const protectedTasks = tasks.filter(isProtectedTransfer);
  const terminalTasks = tasks
    .filter((task) => !isProtectedTransfer(task))
    .sort(
      (left, right) =>
        (right.finishedAt ?? right.createdAt) - (left.finishedAt ?? left.createdAt),
    );
  if (terminalTasks.length <= TRANSFER_HISTORY_LIMIT) {
    return tasks;
  }

  const retainedTerminalTasks = terminalTasks.slice(0, TRANSFER_HISTORY_LIMIT);
  const retainedIds = new Set(
    [...protectedTasks, ...retainedTerminalTasks].map((task) => task.id),
  );
  return tasks.filter((task) => retainedIds.has(task.id));
}

function isRunningAttempt(
  task: FileTransferTask,
  attempt: number,
  runGeneration: number,
) {
  return (
    task.status === "running" &&
    task.attempt === attempt &&
    task.runGeneration === runGeneration
  );
}

function isRunningGeneration(task: FileTransferTask, runGeneration: number) {
  return task.status === "running" && task.runGeneration === runGeneration;
}

function isPendingTransfer(task: FileTransferTask) {
  return (
    task.status === "queued" ||
    task.status === "running" ||
    task.status === "retrying" ||
    task.status === "paused"
  );
}

function isProtectedTransfer(task: FileTransferTask) {
  return isPendingTransfer(task) || (task.status === "failed" && task.canRetry);
}

async function releaseRemoteFileTransfers(transferIds: string[]) {
  await Promise.allSettled(transferIds.map(cancelRemoteFileTransfer));
}
