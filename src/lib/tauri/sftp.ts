import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  RemoteDirectory,
  RemoteUploadProgress,
  RemoteUploadResult,
  UploadRemoteFileInput,
} from "@/types/sftp";

const LIST_REMOTE_DIRECTORY_COMMAND = "list_remote_directory";
const UPLOAD_REMOTE_FILE_COMMAND = "upload_remote_file";
const CANCEL_REMOTE_FILE_UPLOAD_COMMAND = "cancel_remote_file_upload";

export function listRemoteDirectory(sessionId: string, path?: string) {
  return invoke<RemoteDirectory>(LIST_REMOTE_DIRECTORY_COMMAND, {
    sessionId,
    path,
  });
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
