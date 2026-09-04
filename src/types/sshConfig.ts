import type { AuthenticationMethod } from "@/types/connections";

export type SshConfigConflictStrategy = "overwrite" | "skip" | "keepBoth";

export type SshConfigCandidateStatus = "ready" | "conflict" | "skipped";

export type SshConfigPreviewItem = {
  key: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  authenticationMethod: AuthenticationMethod;
  privateKeyPath: string | null;
  sourcePath: string;
  lineNumber: number;
  status: SshConfigCandidateStatus;
  existingConnectionId: string | null;
  reason: string | null;
  warnings: string[];
};

export type SshConfigPreview = {
  sourcePath: string;
  fingerprint: string;
  items: SshConfigPreviewItem[];
  warnings: string[];
};

export type ImportSshConfigInput = {
  fingerprint: string;
  selectedKeys: string[];
  conflictStrategy: SshConfigConflictStrategy;
};

export type SshConfigImportResult = {
  importedCount: number;
  overwrittenCount: number;
  skippedCount: number;
  duplicatedCount: number;
};
