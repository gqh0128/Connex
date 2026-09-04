import { invoke } from "@tauri-apps/api/core";

import type {
  ImportSshConfigInput,
  SshConfigImportResult,
  SshConfigPreview,
} from "@/types/sshConfig";

const PREVIEW_SSH_CONFIG_IMPORT_COMMAND = "preview_ssh_config_import";
const IMPORT_SSH_CONFIG_COMMAND = "import_ssh_config";

export function previewSshConfigImport() {
  return invoke<SshConfigPreview>(PREVIEW_SSH_CONFIG_IMPORT_COMMAND);
}

export function importSshConfig(input: ImportSshConfigInput) {
  return invoke<SshConfigImportResult>(IMPORT_SSH_CONFIG_COMMAND, { input });
}
