import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  AttachRemoteFileTransfersInput,
  DownloadRemoteFileInput,
  LocalDownloadTargetSelection,
  LocalUploadFileSelection,
  RemoteDirectory,
  RemoteDownloadResult,
  RemoteFileTransferControlStatus,
  RemoteFileTransferProgress,
  RemoteUploadResult,
  SelectLocalDownloadTargetInput,
  SelectLocalUploadFilesInput,
  UploadRemoteFileInput,
} from "@/types/sftp";

const LIST_REMOTE_DIRECTORY_COMMAND = "list_remote_directory";
const CREATE_REMOTE_DIRECTORY_COMMAND = "create_remote_directory";
const CREATE_REMOTE_FILE_COMMAND = "create_remote_file";
const RENAME_REMOTE_ENTRY_COMMAND = "rename_remote_entry";
const DELETE_REMOTE_ENTRY_COMMAND = "delete_remote_entry";
const SELECT_LOCAL_UPLOAD_FILES_COMMAND = "select_local_upload_files";
const SELECT_LOCAL_DOWNLOAD_TARGET_COMMAND = "select_local_download_target";
const ATTACH_REMOTE_FILE_TRANSFERS_COMMAND = "attach_remote_file_transfers";
const UPLOAD_REMOTE_FILE_COMMAND = "upload_remote_file";
const DOWNLOAD_REMOTE_FILE_COMMAND = "download_remote_file";
const PAUSE_REMOTE_FILE_TRANSFER_COMMAND = "pause_remote_file_transfer";
const CANCEL_REMOTE_FILE_TRANSFER_COMMAND = "cancel_remote_file_transfer";

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

export function selectLocalUploadFiles(input: SelectLocalUploadFilesInput) {
  return invoke<LocalUploadFileSelection[]>(SELECT_LOCAL_UPLOAD_FILES_COMMAND, {
    input,
  });
}

export function selectLocalDownloadTarget(input: SelectLocalDownloadTargetInput) {
  return invoke<LocalDownloadTargetSelection | null>(
    SELECT_LOCAL_DOWNLOAD_TARGET_COMMAND,
    { input },
  );
}

export function attachRemoteFileTransfers(input: AttachRemoteFileTransfersInput) {
  return invoke<void>(ATTACH_REMOTE_FILE_TRANSFERS_COMMAND, { input });
}

export function uploadRemoteFile(
  input: UploadRemoteFileInput,
  onProgress: (progress: RemoteFileTransferProgress) => void,
) {
  const progressChannel = new Channel<RemoteFileTransferProgress>(onProgress);
  return invoke<RemoteUploadResult>(UPLOAD_REMOTE_FILE_COMMAND, {
    input,
    onProgress: progressChannel,
  });
}

export function downloadRemoteFile(
  input: DownloadRemoteFileInput,
  onProgress: (progress: RemoteFileTransferProgress) => void,
) {
  const progressChannel = new Channel<RemoteFileTransferProgress>(onProgress);
  return invoke<RemoteDownloadResult>(DOWNLOAD_REMOTE_FILE_COMMAND, {
    input,
    onProgress: progressChannel,
  });
}

export function cancelRemoteFileTransfer(transferId: string) {
  return invoke<RemoteFileTransferControlStatus>(CANCEL_REMOTE_FILE_TRANSFER_COMMAND, {
    transferId,
  });
}

export function pauseRemoteFileTransfer(transferId: string) {
  return invoke<RemoteFileTransferControlStatus>(PAUSE_REMOTE_FILE_TRANSFER_COMMAND, {
    transferId,
  });
}
