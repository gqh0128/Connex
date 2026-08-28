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
  sessionId: string;
  localPath: string;
  remoteDirectory: string;
};

export type RemoteUploadProgress = {
  transferId: string;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
};

export type RemoteUploadResult = {
  remotePath: string;
  totalBytes: number;
};
