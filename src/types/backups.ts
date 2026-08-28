export type BackupConflictStrategy = "overwrite" | "skip" | "keepBoth";

export type ExportConnectionBackupInput = {
  path: string;
  exportPassword: string;
  includeCredentials: boolean;
};

export type InspectConnectionBackupInput = {
  path: string;
  exportPassword: string;
};

export type ImportConnectionBackupInput = InspectConnectionBackupInput & {
  conflictStrategy: BackupConflictStrategy;
};

export type BackupExportResult = {
  connectionCount: number;
  credentialCount: number;
};

export type BackupPreview = {
  createdAtUnixMs: number;
  connectionCount: number;
  credentialCount: number;
  conflictCount: number;
  includesCredentials: boolean;
};

export type BackupImportResult = {
  importedCount: number;
  overwrittenCount: number;
  skippedCount: number;
  duplicatedCount: number;
};
