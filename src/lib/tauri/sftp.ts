import { invoke } from "@tauri-apps/api/core";

import type { RemoteDirectory } from "@/types/sftp";

const LIST_REMOTE_DIRECTORY_COMMAND = "list_remote_directory";

export function listRemoteDirectory(sessionId: string, path?: string) {
  return invoke<RemoteDirectory>(LIST_REMOTE_DIRECTORY_COMMAND, {
    sessionId,
    path,
  });
}
