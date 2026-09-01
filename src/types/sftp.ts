export type RemoteFileKind = "directory" | "file" | "symlink" | "other";

export type RemoteFileEntry = {
  name: string;
  path: string;
  kind: RemoteFileKind;
  size: number | null;
  modifiedAt: number | null;
};

export type RemoteDirectory = {
  path: string;
  entries: RemoteFileEntry[];
};

export type UploadRemoteFileInput = {
  transferId: string;
};

export type SelectLocalUploadFilesInput = {
  sessionId: string;
  remoteDirectory: string;
};

export type LocalUploadFileSelection = {
  transferId: string;
  fileName: string;
  totalBytes: number;
};

export type DownloadRemoteFileInput = {
  transferId: string;
};

export type SelectLocalDownloadTargetInput = {
  sessionId: string;
  remotePath: string;
  defaultFileName: string;
};

export type LocalDownloadTargetSelection = {
  transferId: string;
  totalBytes: number;
};

export type AttachRemoteFileTransfersInput = {
  transferIds: string[];
};

export type RemoteFileTransferControlStatus = "accepted" | "tooLate" | "notFound";

export type RemoteFileTransferProgress = {
  transferId: string;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
};

export type RemoteUploadResult = {
  remotePath: string;
  totalBytes: number;
};

export type RemoteDownloadResult = {
  localPath: string;
  totalBytes: number;
};
