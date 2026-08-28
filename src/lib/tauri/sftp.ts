import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  RemoteDirectory,
  RemoteUploadProgress,
  RemoteUploadResult,
  UploadRemoteFileInput,
} from "@/types/sftp";

const LIST_REMOTE_DIRECTORY_COMMAND = "list_remote_directory";
const CREATE_REMOTE_DIRECTORY_COMMAND = "create_remote_directory";
const CREATE_REMOTE_FILE_COMMAND = "create_remote_file";
const RENAME_REMOTE_ENTRY_COMMAND = "rename_remote_entry";
const DELETE_REMOTE_ENTRY_COMMAND = "delete_remote_entry";
const UPLOAD_REMOTE_FILE_COMMAND = "upload_remote_file";
const CANCEL_REMOTE_FILE_UPLOAD_COMMAND = "cancel_remote_file_upload";

export function listRemoteDirectory(sessionId: string, path?: string) {
  return invoke<RemoteDirectory>(LIST_REMOTE_DIRECTORY_COMMAND, {
    sessionId,
    path,
  });
}

export function createRemoteDirectory(
  sessionId: string,
  parentPath: string,
  name: string,
) {
  return invoke<string>(CREATE_REMOTE_DIRECTORY_COMMAND, {
    sessionId,
    parentPath,
    name,
  });
}

export function createRemoteFile(sessionId: string, parentPath: string, name: string) {
  return invoke<string>(CREATE_REMOTE_FILE_COMMAND, {
    sessionId,
    parentPath,
    name,
  });
}

export function renameRemoteEntry(sessionId: string, path: string, newName: string) {
  return invoke<string>(RENAME_REMOTE_ENTRY_COMMAND, {
    sessionId,
    path,
    newName,
  });
}

export function deleteRemoteEntry(sessionId: string, path: string) {
  return invoke<void>(DELETE_REMOTE_ENTRY_COMMAND, { sessionId, path });
}

export function uploadRemoteFile(
  input: UploadRemoteFileInput,
  onProgress: (progress: RemoteUploadProgress) => void,
) {
  const progressChannel = new Channel<RemoteUploadProgress>(onProgress);
  return invoke<RemoteUploadResult>(UPLOAD_REMOTE_FILE_COMMAND, {
    input,
    onProgress: progressChannel,
  });
}

export function cancelRemoteFileUpload(transferId: string) {
  return invoke<void>(CANCEL_REMOTE_FILE_UPLOAD_COMMAND, { transferId });
}
