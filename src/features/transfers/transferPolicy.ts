export const TRANSFER_CONCURRENCY_LIMIT = 3;
export const TRANSFER_MAX_ATTEMPTS = 3;
export const TRANSFER_HISTORY_LIMIT = 100;

const AUTOMATIC_RETRY_DELAYS_MS = [1_000, 3_000] as const;
const AUTOMATICALLY_RETRYABLE_ERROR_CODES = new Set([
  "remote_upload_failed",
  "remote_download_failed",
  "sftp_unavailable",
  "remote_directory_unavailable",
]);

export function getAutomaticRetryDelayMs(errorCode: string, attempt: number) {
  if (!AUTOMATICALLY_RETRYABLE_ERROR_CODES.has(errorCode)) {
    return null;
  }

  return AUTOMATIC_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export function canManuallyRetryTransfer(errorCode: string) {
  return AUTOMATICALLY_RETRYABLE_ERROR_CODES.has(errorCode);
}
