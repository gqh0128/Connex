import type { CommandError } from "@/types/ipc";

const UNKNOWN_COMMAND_ERROR: CommandError = {
  code: "unknown_error",
  message: "操作未能完成，请稍后重试。",
  field: null,
};

export function getCommandError(error: unknown): CommandError {
  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>;
    if (typeof value.code === "string" && typeof value.message === "string") {
      return {
        code: value.code,
        message: value.message,
        field: typeof value.field === "string" ? value.field : null,
      };
    }
  }

  if (typeof error === "string" && error.trim()) {
    return {
      ...UNKNOWN_COMMAND_ERROR,
      message: error,
    };
  }

  return UNKNOWN_COMMAND_ERROR;
}
