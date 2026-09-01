export type FileTransferDirection = "upload" | "download";

export type FileTransferStatus =
  "queued" | "running" | "retrying" | "completed" | "cancelled" | "failed";

export type FileTransferTask = {
  id: string;
  direction: FileTransferDirection;
  fileName: string;
  connectionName: string;
  transferredBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
  status: FileTransferStatus;
  attempt: number;
  runGeneration: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  canRetry: boolean;
  isCancelling: boolean;
  isReleaseBlocked: boolean;
  errorMessage: string | null;
  queueOrder: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};
