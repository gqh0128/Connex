import { invoke } from "@tauri-apps/api/core";

import type { CustomTerminalFont } from "@/types/terminalFonts";

const LIST_TERMINAL_FONTS_COMMAND = "list_terminal_fonts";
const IMPORT_TERMINAL_FONT_COMMAND = "import_terminal_font";
const READ_TERMINAL_FONT_COMMAND = "read_terminal_font";
const DELETE_TERMINAL_FONT_COMMAND = "delete_terminal_font";

export function listTerminalFonts() {
  return invoke<CustomTerminalFont[]>(LIST_TERMINAL_FONTS_COMMAND);
}

export function importTerminalFont(path: string) {
  return invoke<CustomTerminalFont>(IMPORT_TERMINAL_FONT_COMMAND, {
    input: { path },
  });
}

export async function readTerminalFont(id: string) {
  const response = await invoke<unknown>(READ_TERMINAL_FONT_COMMAND, {
    input: { id },
  });
  if (response instanceof ArrayBuffer) {
    return response;
  }
  if (ArrayBuffer.isView(response)) {
    return response.buffer.slice(
      response.byteOffset,
      response.byteOffset + response.byteLength,
    );
  }
  throw new Error("字体文件响应格式无效。");
}

export function deleteTerminalFont(id: string) {
  return invoke<void>(DELETE_TERMINAL_FONT_COMMAND, {
    input: { id },
  });
}
