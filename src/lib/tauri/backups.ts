import { invoke } from "@tauri-apps/api/core";

import type {
  BackupExportResult,
  BackupImportResult,
  BackupPreview,
  ExportConnectionBackupInput,
  ImportConnectionBackupInput,
  InspectConnectionBackupInput,
} from "@/types/backups";

const EXPORT_CONNECTION_BACKUP_COMMAND = "export_connection_backup";
const INSPECT_CONNECTION_BACKUP_COMMAND = "inspect_connection_backup";
const IMPORT_CONNECTION_BACKUP_COMMAND = "import_connection_backup";

export function exportConnectionBackup(input: ExportConnectionBackupInput) {
  return invoke<BackupExportResult>(EXPORT_CONNECTION_BACKUP_COMMAND, { input });
}

export function inspectConnectionBackup(input: InspectConnectionBackupInput) {
  return invoke<BackupPreview>(INSPECT_CONNECTION_BACKUP_COMMAND, { input });
}

export function importConnectionBackup(input: ImportConnectionBackupInput) {
  return invoke<BackupImportResult>(IMPORT_CONNECTION_BACKUP_COMMAND, { input });
}
