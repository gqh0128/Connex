import { FileArchive } from "lucide-react";
import {
  useId,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { SecretInput } from "@/components/ui/secret-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { importConnectionBackup, inspectConnectionBackup } from "@/lib/tauri/backups";
import { chooseConnectionBackupImportPath } from "@/lib/tauri/dialogs";
import { getCommandError } from "@/lib/tauri/errors";
import type {
  BackupConflictStrategy,
  BackupImportResult,
  BackupPreview,
} from "@/types/backups";

type ImportConnectionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

type ImportErrors = Partial<Record<"path" | "exportPassword" | "form", string>>;

export function ImportConnectionsDialog({
  open,
  onOpenChange,
  onImported,
}: ImportConnectionsDialogProps) {
  const formId = useId();
  const [path, setPath] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState("");
  const [conflictStrategy, setConflictStrategy] =
    useState<BackupConflictStrategy>("overwrite");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [result, setResult] = useState<BackupImportResult | null>(null);
  const [errors, setErrors] = useState<ImportErrors>({});
  const [isWorking, setIsWorking] = useState(false);

  const reset = () => {
    setPath(null);
    setExportPassword("");
    setConflictStrategy("overwrite");
    setPreview(null);
    setResult(null);
    setErrors({});
    setIsWorking(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isWorking) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const chooseFile = async () => {
    setIsWorking(true);
    setErrors({});
    try {
      const selected = await chooseConnectionBackupImportPath();
      if (!selected) {
        return;
      }

      setPath(selected);
      setPreview(null);
      setResult(null);
    } catch (error) {
      applyCommandError(error, setErrors);
    } finally {
      setIsWorking(false);
    }
  };

  const handleInspect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) {
      await handleImport();
      return;
    }

    const nextErrors: ImportErrors = {};
    if (!path) {
      nextErrors.path = "请先选择 Connex 连接备份文件。";
    }
    if (exportPassword.length < 8) {
      nextErrors.exportPassword = "请输入导出时设置的密码。";
    }
    if (Object.keys(nextErrors).length > 0 || !path) {
      setErrors(nextErrors);
      return;
    }

    setIsWorking(true);
    setErrors({});
    try {
      setPreview(await inspectConnectionBackup({ path, exportPassword }));
    } catch (error) {
      applyCommandError(error, setErrors);
    } finally {
      setIsWorking(false);
    }
  };

  async function handleImport() {
    if (!path || !preview) {
      return;
    }

    setIsWorking(true);
    setErrors({});
    try {
      const importResult = await importConnectionBackup({
        path,
        exportPassword,
        conflictStrategy,
      });
      setExportPassword("");
      setResult(importResult);
      onImported();
    } catch (error) {
      applyCommandError(error, setErrors);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-5" onSubmit={handleInspect}>
          <DialogHeader>
            <DialogTitle>导入连接备份</DialogTitle>
            <DialogDescription>
              选择 `.connex-backup` 文件并输入导出密码，确认内容后再写入本机。
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              <p>连接备份已成功导入。</p>
              <p className="text-muted-foreground">
                已写入 {result.importedCount} 个连接，覆盖 {result.overwrittenCount}
                个，跳过 {result.skippedCount} 个，保留副本 {result.duplicatedCount}
                个。
              </p>
            </div>
          ) : (
            <FieldGroup className="gap-5">
              <Field className="gap-2" data-invalid={Boolean(errors.path)}>
                <FieldLabel>备份文件</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={isWorking}
                  onClick={() => void chooseFile()}
                >
                  <FileArchive data-icon="inline-start" />
                  <span className="truncate">
                    {path ? fileNameFromPath(path) : "选择 .connex-backup 文件"}
                  </span>
                </Button>
                <FieldDescription>
                  文件内容由 Rust 直接读取，不经过 React 状态。
                </FieldDescription>
                <FieldError>{errors.path}</FieldError>
              </Field>

              <Field
                className="gap-2"
                data-invalid={Boolean(errors.exportPassword)}
                data-disabled={isWorking}
              >
                <FieldLabel htmlFor={`${formId}-import-password`}>导出密码</FieldLabel>
                <SecretInput
                  id={`${formId}-import-password`}
                  value={exportPassword}
                  placeholder="输入备份的导出密码"
                  secretLabel="导出密码"
                  ariaInvalid={Boolean(errors.exportPassword)}
                  disabled={isWorking}
                  onChange={(value) => {
                    setExportPassword(value);
                    setPreview(null);
                    setErrors((current) => ({
                      ...current,
                      exportPassword: undefined,
                      form: undefined,
                    }));
                  }}
                />
                <FieldError>{errors.exportPassword}</FieldError>
              </Field>

              {preview ? (
                <FieldSet className="gap-3">
                  <FieldLegend variant="label">备份内容</FieldLegend>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{preview.connectionCount} 个连接</Badge>
                    <Badge variant="secondary">
                      {preview.credentialCount} 条密码或口令
                    </Badge>
                    <Badge variant={preview.conflictCount ? "outline" : "secondary"}>
                      {preview.conflictCount} 个冲突
                    </Badge>
                  </div>
                  <FieldDescription>
                    创建于 {formatBackupDate(preview.createdAtUnixMs)}；
                    {preview.includesCredentials ? "包含已保存凭据" : "仅包含连接信息"}
                    。
                  </FieldDescription>

                  {preview.conflictCount > 0 ? (
                    <FieldGroup className="gap-2">
                      <FieldLabel id={`${formId}-conflict-label`}>冲突处理</FieldLabel>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={conflictStrategy}
                        className="w-full"
                        aria-labelledby={`${formId}-conflict-label`}
                        onValueChange={(value) => {
                          if (isConflictStrategy(value)) {
                            setConflictStrategy(value);
                          }
                        }}
                      >
                        <ToggleGroupItem value="overwrite" className="flex-1">
                          覆盖
                        </ToggleGroupItem>
                        <ToggleGroupItem value="skip" className="flex-1">
                          跳过
                        </ToggleGroupItem>
                        <ToggleGroupItem value="keepBoth" className="flex-1">
                          保留两份
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FieldGroup>
                  ) : null}
                </FieldSet>
              ) : null}

              {errors.form ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              ) : null}
            </FieldGroup>
          )}

          <DialogFooter>
            {result ? (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                完成
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isWorking}
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                {preview ? (
                  <Button type="submit" disabled={isWorking}>
                    {isWorking ? "正在导入…" : "开始导入"}
                  </Button>
                ) : (
                  <Button type="submit" disabled={isWorking}>
                    {isWorking ? "正在读取…" : "读取备份"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function applyCommandError(
  error: unknown,
  setErrors: Dispatch<SetStateAction<ImportErrors>>,
) {
  const commandError = getCommandError(error);
  if (commandError.field === "exportPassword") {
    setErrors({ exportPassword: commandError.message });
  } else {
    setErrors({ form: commandError.message });
  }
}

function isConflictStrategy(value: string): value is BackupConflictStrategy {
  return value === "overwrite" || value === "skip" || value === "keepBoth";
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function formatBackupDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
