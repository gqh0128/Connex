import { useId, useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCommandError } from "@/lib/tauri/errors";
import type {
  AuthenticationMethod,
  ConnectionProfile,
  SaveConnectionInput,
} from "@/types/connections";

import { SecretInput } from "./SecretInput";

type ConnectionFormDialogProps = {
  open: boolean;
  connection: ConnectionProfile | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: SaveConnectionInput) => Promise<unknown>;
  onRevealCredential?: () => Promise<string | null>;
  onDelete?: () => Promise<void>;
};

type ConnectionFormState = Omit<
  SaveConnectionInput,
  "port" | "privateKeyPath" | "password" | "privateKeyPassphrase"
> & {
  port: string;
  privateKeyPath: string;
  password: string;
  privateKeyPassphrase: string;
};

type FormField = keyof ConnectionFormState | "form";
type FormErrors = Partial<Record<FormField, string>>;

const AUTHENTICATION_OPTIONS: Array<{
  value: AuthenticationMethod;
  label: string;
}> = [
  { value: "password", label: "密码" },
  { value: "privateKey", label: "私钥" },
  { value: "agent", label: "SSH Agent" },
];

export function ConnectionFormDialog({
  open,
  connection,
  onOpenChange,
  onSubmit,
  onRevealCredential,
  onDelete,
}: ConnectionFormDialogProps) {
  const formId = useId();
  const [form, setForm] = useState<ConnectionFormState>(() =>
    getInitialForm(connection),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isEditing = connection !== null;
  const canKeepCredential = Boolean(
    connection?.hasStoredCredential &&
    connection.authenticationMethod === form.authenticationMethod,
  );

  const setField = <FieldName extends keyof ConnectionFormState>(
    field: FieldName,
    value: ConnectionFormState[FieldName],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setForm((current) => ({
        ...current,
        password: "",
        privateKeyPassphrase: "",
      }));
      setErrors({});
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(form, connection);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      await onSubmit({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        username: form.username.trim(),
        authenticationMethod: form.authenticationMethod,
        privateKeyPath:
          form.authenticationMethod === "privateKey"
            ? form.privateKeyPath.trim()
            : null,
        password:
          form.authenticationMethod === "password" && form.password
            ? form.password
            : null,
        privateKeyPassphrase:
          form.authenticationMethod === "privateKey" && form.privateKeyPassphrase
            ? form.privateKeyPassphrase
            : null,
      });
      handleOpenChange(false);
    } catch (error) {
      const commandError = getCommandError(error);
      const field = isFormField(commandError.field) ? commandError.field : "form";
      setErrors({ [field]: commandError.message });
    } finally {
      setIsSaving(false);
    }
  };

  const revealStoredCredential = async (field: "password" | "privateKeyPassphrase") => {
    if (!onRevealCredential) {
      return null;
    }

    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    try {
      const credential = await onRevealCredential();
      if (credential === null) {
        setErrors((current) => ({
          ...current,
          [field]: "没有找到已保存的凭据，请输入新值后保存。",
        }));
      }
      return credential;
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [field]: getCommandError(error).message,
      }));
      return null;
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onDelete();
      setIsDeleteOpen(false);
      handleOpenChange(false);
    } catch (error) {
      setDeleteError(getCommandError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
            <DialogHeader className="px-5 pb-4 pt-5 pr-12">
              <DialogTitle>{isEditing ? "编辑 SSH 连接" : "新建 SSH 连接"}</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "更新连接信息；凭据留空时保留已保存内容。"
                  : "连接信息保存在本机，密码或口令进入系统安全凭据管理器。"}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto border-y px-5 py-5">
              <FieldGroup className="gap-5">
                <Field className="gap-2" data-invalid={Boolean(errors.name)}>
                  <FieldLabel htmlFor={`${formId}-name`}>连接名称</FieldLabel>
                  <Input
                    id={`${formId}-name`}
                    value={form.name}
                    maxLength={80}
                    autoFocus
                    autoComplete="off"
                    placeholder="例如：生产服务器"
                    aria-invalid={Boolean(errors.name)}
                    onChange={(event) => setField("name", event.target.value)}
                  />
                  <FieldError>{errors.name}</FieldError>
                </Field>

                <FieldGroup className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                  <Field className="gap-2" data-invalid={Boolean(errors.host)}>
                    <FieldLabel htmlFor={`${formId}-host`}>主机</FieldLabel>
                    <Input
                      id={`${formId}-host`}
                      value={form.host}
                      maxLength={255}
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="server.example.com"
                      aria-invalid={Boolean(errors.host)}
                      onChange={(event) => setField("host", event.target.value)}
                    />
                    <FieldError>{errors.host}</FieldError>
                  </Field>

                  <Field className="gap-2" data-invalid={Boolean(errors.port)}>
                    <FieldLabel htmlFor={`${formId}-port`}>端口</FieldLabel>
                    <Input
                      id={`${formId}-port`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={65535}
                      value={form.port}
                      aria-invalid={Boolean(errors.port)}
                      onChange={(event) => setField("port", event.target.value)}
                    />
                    <FieldError>{errors.port}</FieldError>
                  </Field>
                </FieldGroup>

                <Field className="gap-2" data-invalid={Boolean(errors.username)}>
                  <FieldLabel htmlFor={`${formId}-username`}>用户名</FieldLabel>
                  <Input
                    id={`${formId}-username`}
                    value={form.username}
                    maxLength={128}
                    autoCapitalize="none"
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="root"
                    aria-invalid={Boolean(errors.username)}
                    onChange={(event) => setField("username", event.target.value)}
                  />
                  <FieldError>{errors.username}</FieldError>
                </Field>

                <FieldSet className="gap-2">
                  <FieldLegend variant="label">认证方式</FieldLegend>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={form.authenticationMethod}
                    className="w-full"
                    aria-label="认证方式"
                    onValueChange={(value) => {
                      if (value) {
                        setField("authenticationMethod", value as AuthenticationMethod);
                      }
                    }}
                  >
                    {AUTHENTICATION_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className="flex-1"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>

                {form.authenticationMethod === "password" ? (
                  <Field className="gap-2" data-invalid={Boolean(errors.password)}>
                    <FieldLabel htmlFor={`${formId}-password`}>登录密码</FieldLabel>
                    <SecretInput
                      id={`${formId}-password`}
                      value={form.password}
                      secretLabel="密码"
                      placeholder={
                        canKeepCredential ? "留空保留已保存密码" : "输入密码"
                      }
                      ariaInvalid={Boolean(errors.password)}
                      onChange={(value) => setField("password", value)}
                      onRevealStored={
                        canKeepCredential
                          ? () => revealStoredCredential("password")
                          : undefined
                      }
                    />
                    <FieldDescription>
                      {canKeepCredential
                        ? "留空保留原密码；输入新值会覆盖系统凭据。"
                        : "密码将保存到系统安全凭据管理器，不会写入 SQLite。"}
                    </FieldDescription>
                    <FieldError>{errors.password}</FieldError>
                  </Field>
                ) : null}

                {form.authenticationMethod === "privateKey" ? (
                  <FieldGroup className="gap-5">
                    <Field
                      className="gap-2"
                      data-invalid={Boolean(errors.privateKeyPath)}
                    >
                      <FieldLabel htmlFor={`${formId}-private-key`}>
                        私钥路径
                      </FieldLabel>
                      <Input
                        id={`${formId}-private-key`}
                        value={form.privateKeyPath}
                        autoCapitalize="none"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="/Users/name/.ssh/id_ed25519"
                        aria-invalid={Boolean(errors.privateKeyPath)}
                        onChange={(event) =>
                          setField("privateKeyPath", event.target.value)
                        }
                      />
                      <FieldDescription>
                        只保存本地路径，不复制私钥文件内容。
                      </FieldDescription>
                      <FieldError>{errors.privateKeyPath}</FieldError>
                    </Field>

                    <Field
                      className="gap-2"
                      data-invalid={Boolean(errors.privateKeyPassphrase)}
                    >
                      <FieldLabel htmlFor={`${formId}-private-key-passphrase`}>
                        私钥口令（可选）
                      </FieldLabel>
                      <SecretInput
                        id={`${formId}-private-key-passphrase`}
                        value={form.privateKeyPassphrase}
                        secretLabel="私钥口令"
                        placeholder={
                          canKeepCredential ? "留空保留已保存口令" : "未加密私钥可留空"
                        }
                        ariaInvalid={Boolean(errors.privateKeyPassphrase)}
                        onChange={(value) => setField("privateKeyPassphrase", value)}
                        onRevealStored={
                          canKeepCredential
                            ? () => revealStoredCredential("privateKeyPassphrase")
                            : undefined
                        }
                      />
                      <FieldDescription>
                        {canKeepCredential
                          ? "留空保留原口令；输入新值会覆盖系统凭据。"
                          : "仅加密私钥需要填写，口令会保存到系统安全凭据管理器。"}
                      </FieldDescription>
                      <FieldError>{errors.privateKeyPassphrase}</FieldError>
                    </Field>
                  </FieldGroup>
                ) : null}

                {form.authenticationMethod === "agent" ? (
                  <FieldDescription>
                    使用系统 SSH Agent，不保存密码或私钥口令。
                  </FieldDescription>
                ) : null}

                {errors.form ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.form}
                  </p>
                ) : null}
              </FieldGroup>
            </div>

            <DialogFooter className="px-5 py-4 sm:items-center">
              {isEditing && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mr-auto"
                  disabled={isSaving}
                  onClick={() => setIsDeleteOpen(true)}
                >
                  删除连接
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "保存中…" : isEditing ? "保存修改" : "保存连接"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{connection?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              连接配置及其系统安全凭据将从本机移除。此操作不会影响服务器数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getInitialForm(connection: ConnectionProfile | null): ConnectionFormState {
  if (!connection) {
    return {
      name: "",
      host: "",
      port: "22",
      username: "",
      authenticationMethod: "password",
      privateKeyPath: "",
      password: "",
      privateKeyPassphrase: "",
    };
  }

  return {
    name: connection.name,
    host: connection.host,
    port: String(connection.port),
    username: connection.username,
    authenticationMethod: connection.authenticationMethod,
    privateKeyPath: connection.privateKeyPath ?? "",
    password: "",
    privateKeyPassphrase: "",
  };
}

function validateForm(
  form: ConnectionFormState,
  connection: ConnectionProfile | null,
): FormErrors {
  const errors: FormErrors = {};
  const port = Number(form.port);

  if (!form.name.trim()) {
    errors.name = "请输入连接名称。";
  }
  if (!form.host.trim()) {
    errors.host = "请输入服务器主机名或 IP 地址。";
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = "请输入 1 到 65535 之间的端口。";
  }
  if (!form.username.trim()) {
    errors.username = "请输入 SSH 用户名。";
  }
  if (
    form.authenticationMethod === "password" &&
    !form.password &&
    (!connection ||
      connection.authenticationMethod !== "password" ||
      !connection.hasStoredCredential)
  ) {
    errors.password = "请输入 SSH 登录密码。";
  }
  if (form.authenticationMethod === "privateKey" && !form.privateKeyPath.trim()) {
    errors.privateKeyPath = "请输入私钥文件路径。";
  }

  return errors;
}

function isFormField(field: string | null): field is FormField {
  return (
    field === "name" ||
    field === "host" ||
    field === "port" ||
    field === "username" ||
    field === "authenticationMethod" ||
    field === "privateKeyPath" ||
    field === "password" ||
    field === "privateKeyPassphrase"
  );
}
