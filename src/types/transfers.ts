export type FileTransferStatus = "running" | "completed" | "cancelled" | "failed";

export type FileTransferTask = {
  id: string;
  direction: "upload";
  fileName: string;
  connectionName: string;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  status: FileTransferStatus;
  isCancelling: boolean;
  errorMessage: string | null;
  startedAt: number;
  finishedAt: number | null;
};
