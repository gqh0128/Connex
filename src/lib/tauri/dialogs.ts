import { open, save } from "@tauri-apps/plugin-dialog";

const BACKUP_FILTER = [
  {
    name: "Connex 连接备份",
    extensions: ["connex-backup"],
  },
];

const TERMINAL_FONT_FILTER = [
  {
    name: "终端字体",
    extensions: ["ttf", "otf", "woff", "woff2"],
  },
];

export function chooseConnectionBackupExportPath(defaultFileName: string) {
  return save({
    title: "导出 Connex 连接备份",
    defaultPath: defaultFileName,
    filters: BACKUP_FILTER,
  });
}

export function chooseConnectionBackupImportPath() {
  return open({
    title: "导入 Connex 连接备份",
    directory: false,
    multiple: false,
    filters: BACKUP_FILTER,
  });
}

export function chooseTerminalFontFile() {
  return open({
    title: "导入终端字体",
    directory: false,
    multiple: false,
    filters: TERMINAL_FONT_FILTER,
  });
}
