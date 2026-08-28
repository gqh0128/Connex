import { open, save } from "@tauri-apps/plugin-dialog";

const BACKUP_FILTER = [
  {
    name: "Connex 连接备份",
    extensions: ["connex-backup"],
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

export async function chooseLocalFilesForUpload() {
  const selected = await open({
    title: "选择要上传的文件",
    directory: false,
    multiple: true,
  });

  if (!selected) {
    return [];
  }

  return Array.isArray(selected) ? selected : [selected];
}
