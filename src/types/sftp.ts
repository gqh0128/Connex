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
