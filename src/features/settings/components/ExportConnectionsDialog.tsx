import { useId, useState, type FormEvent } from "react";

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
import { exportConnectionBackup } from "@/lib/tauri/backups";
import { chooseConnectionBackupExportPath } from "@/lib/tauri/dialogs";
import { getCommandError } from "@/lib/tauri/errors";
import type { BackupExportResult } from "@/types/backups";

type ExportConnectionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ExportErrors = Partial<
  Record<"exportPassword" | "confirmPassword" | "form", string>
>;

export function ExportConnectionsDialog({
  open,
  onOpenChange,
}: ExportConnectionsDialogProps) {
  const formId = useId();
  const [includeCredentials, setIncludeCredentials] = useState(true);
  const [exportPassword, setExportPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<ExportErrors>({});
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<BackupExportResult | null>(null);

  const reset = () => {
    setIncludeCredentials(true);
    setExportPassword("");
    setConfirmPassword("");
    setErrors({});
    setIsExporting(false);
    setResult(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isExporting) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ExportErrors = {};

    if (exportPassword.length < 8) {
      nextErrors.exportPassword = "导出密码至少需要 8 个字符。";
    }
    if (confirmPassword !== exportPassword) {
      nextErrors.confirmPassword = "两次输入的导出密码不一致。";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsExporting(true);
    setErrors({});
    try {
      const path = await chooseConnectionBackupExportPath(defaultBackupFileName());
      if (!path) {
        return;
      }

      const exportResult = await exportConnectionBackup({
        path,
        exportPassword,
        includeCredentials,
      });
      setExportPassword("");
      setConfirmPassword("");
      setResult(exportResult);
    } catch (error) {
      const commandError = getCommandError(error);
      if (commandError.field === "exportPassword") {
        setErrors({ exportPassword: commandError.message });
      } else {
        setErrors({ form: commandError.message });
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>导出连接备份</DialogTitle>
            <DialogDescription>
              所有导出都使用密码加密。导出文件可在另一台设备的 Connex 中导入。
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              <p>连接备份已成功导出。</p>
              <p className="text-muted-foreground">
                共 {result.connectionCount} 个连接，包含 {result.credentialCount}{" "}
                条密码或口令。
              </p>
            </div>
          ) : (
            <FieldGroup className="gap-5">
              <FieldSet className="gap-2">
                <FieldLegend variant="label">备份内容</FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={includeCredentials ? "credentials" : "metadata"}
                  className="w-full"
                  aria-label="备份内容"
                  onValueChange={(value) => {
                    if (value) {
                      setIncludeCredentials(value === "credentials");
                    }
                  }}
                >
                  <ToggleGroupItem value="credentials" className="flex-1">
                    包含密码和口令
                  </ToggleGroupItem>
                  <ToggleGroupItem value="metadata" className="flex-1">
                    仅连接信息
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  默认包含已保存密码和私钥口令；私钥文件本身暂不复制。
                </FieldDescription>
              </FieldSet>

              <Field
                className="gap-2"
                data-invalid={Boolean(errors.exportPassword)}
                data-disabled={isExporting}
              >
                <FieldLabel htmlFor={`${formId}-export-password`}>导出密码</FieldLabel>
                <SecretInput
                  id={`${formId}-export-password`}
                  value={exportPassword}
                  placeholder="至少 8 个字符"
                  secretLabel="导出密码"
                  ariaInvalid={Boolean(errors.exportPassword)}
                  disabled={isExporting}
                  onChange={(value) => {
                    setExportPassword(value);
                    setErrors((current) => ({
                      ...current,
                      exportPassword: undefined,
                      form: undefined,
                    }));
                  }}
                />
                <FieldDescription>
                  Connex 不会保存这个密码；新设备导入时必须再次输入。
                </FieldDescription>
                <FieldError>{errors.exportPassword}</FieldError>
              </Field>

              <Field
                className="gap-2"
                data-invalid={Boolean(errors.confirmPassword)}
                data-disabled={isExporting}
              >
                <FieldLabel htmlFor={`${formId}-confirm-password`}>
                  确认导出密码
                </FieldLabel>
                <SecretInput
                  id={`${formId}-confirm-password`}
                  value={confirmPassword}
                  placeholder="再次输入导出密码"
                  secretLabel="确认密码"
                  ariaInvalid={Boolean(errors.confirmPassword)}
                  disabled={isExporting}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    setErrors((current) => ({
                      ...current,
                      confirmPassword: undefined,
                      form: undefined,
                    }));
                  }}
                />
                <FieldError>{errors.confirmPassword}</FieldError>
              </Field>

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
                  disabled={isExporting}
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isExporting}>
                  {isExporting ? "正在导出…" : "选择位置并导出"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultBackupFileName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `Connex-connections-${year}-${month}-${day}.connex-backup`;
}
