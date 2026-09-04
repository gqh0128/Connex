import { useEffect, useId, useState, type FormEvent } from "react";

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
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { SecretInput } from "@/components/ui/secret-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCommandError } from "@/lib/tauri/errors";
import type {
  AuthenticationMethod,
  ConnectionProfile,
  SaveConnectionInput,
} from "@/types/connections";

import { ConnectionTestControls } from "./ConnectionTestControls";

type ConnectionFormDialogProps = {
  open: boolean;
  connection: ConnectionProfile | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: SaveConnectionInput) => Promise<unknown>;
  onRevealCredential: (connectionId: string) => Promise<string | null>;
};

type ConnectionFormState = Omit<
  SaveConnectionInput,
  "port" | "privateKeyPath" | "password" | "privateKeyPassphrase" | "clearCredential"
> & {
  port: string;
  privateKeyPath: string;
  password: string;
  privateKeyPassphrase: string;
};

type FormField = keyof ConnectionFormState | "form";
type FormErrors = Partial<Record<FormField, string>>;
type CredentialEdits = {
  password: boolean;
  privateKeyPassphrase: boolean;
};

const EMPTY_CREDENTIAL_EDITS: CredentialEdits = {
  password: false,
  privateKeyPassphrase: false,
};

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
}: ConnectionFormDialogProps) {
  const formId = useId();
  const [form, setForm] = useState<ConnectionFormState>(() =>
    getInitialForm(connection),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isCredentialLoading, setIsCredentialLoading] = useState(
    Boolean(connection?.hasStoredCredential && getCredentialField(connection)),
  );
  const [credentialEdits, setCredentialEdits] =
    useState<CredentialEdits>(EMPTY_CREDENTIAL_EDITS);
  const [testRevision, setTestRevision] = useState(0);
  const isEditing = connection !== null;
  const canKeepCredential = Boolean(
    connection?.hasStoredCredential &&
    connection.authenticationMethod === form.authenticationMethod,
  );
  const endpointError = [errors.host, errors.port].filter(Boolean).join(" ");

  const setField = <FieldName extends keyof ConnectionFormState>(
    field: FieldName,
    value: ConnectionFormState[FieldName],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setTestRevision((current) => current + 1);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setForm((current) => ({
        ...current,
        password: "",
        privateKeyPassphrase: "",
      }));
      setErrors({});
      setCredentialEdits(EMPTY_CREDENTIAL_EDITS);
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      await onSubmit({
        ...toSaveConnectionInput(form, connection, credentialEdits),
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
    if (!connection) {
      return null;
    }

    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    try {
      const credential = await onRevealCredential(connection.id);
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

  useEffect(() => {
    if (!open || !connection?.hasStoredCredential) {
      return;
    }

    let isActive = true;
    const credentialField = getCredentialField(connection);

    if (!credentialField) {
      return;
    }

    void onRevealCredential(connection.id)
      .then((credential) => {
        if (!isActive) {
          return;
        }
        if (credential === null) {
          setErrors((current) => ({
            ...current,
            [credentialField]: "没有找到已保存的凭据，请输入新值后保存。",
          }));
          return;
        }
        setForm((current) => ({ ...current, [credentialField]: credential }));
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrors((current) => ({
            ...current,
            [credentialField]: getCommandError(error).message,
          }));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsCredentialLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [connection, onRevealCredential, open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
          <DialogHeader className="px-4 pb-3 pt-4 pr-12">
            <DialogTitle>{isEditing ? "编辑 SSH 连接" : "新建 SSH 连接"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "更新服务器或认证信息；已保存凭据可直接查看和修改。"
                : "填写服务器地址和认证信息；密码可以稍后补充。"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <FieldGroup className="gap-4">
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <Field className="gap-1.5" data-invalid={Boolean(errors.name)}>
                  <FieldLabel htmlFor={`${formId}-name`}>连接名称</FieldLabel>
                  <Input
                    id={`${formId}-name`}
                    value={form.name}
                    maxLength={80}
                    autoFocus
                    autoComplete="off"
                    density="compact"
                    placeholder="例如：生产服务器"
                    aria-invalid={Boolean(errors.name)}
                    onChange={(event) => setField("name", event.target.value)}
                  />
                  <FieldError>{errors.name}</FieldError>
                </Field>

                <Field className="gap-1.5" data-invalid={Boolean(errors.username)}>
                  <FieldLabel htmlFor={`${formId}-username`}>用户名</FieldLabel>
                  <Input
                    id={`${formId}-username`}
                    value={form.username}
                    maxLength={128}
                    autoCapitalize="none"
                    autoComplete="username"
                    spellCheck={false}
                    density="compact"
                    placeholder="root"
                    aria-invalid={Boolean(errors.username)}
                    onChange={(event) => setField("username", event.target.value)}
                  />
                  <FieldError>{errors.username}</FieldError>
                </Field>
              </FieldGroup>

              <Field className="gap-1.5" data-invalid={Boolean(endpointError)}>
                <FieldLabel htmlFor={`${formId}-host`}>服务器地址</FieldLabel>
                <InputGroup size="sm">
                  <InputGroupInput
                    id={`${formId}-host`}
                    value={form.host}
                    maxLength={255}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="server.example.com 或 192.168.1.10"
                    aria-invalid={Boolean(errors.host)}
                    onChange={(event) => setField("host", event.target.value)}
                  />
                  <Separator orientation="vertical" className="my-auto h-5" />
                  <InputGroupInput
                    id={`${formId}-port`}
                    inputMode="numeric"
                    maxLength={5}
                    value={form.port}
                    aria-label="SSH 端口"
                    aria-invalid={Boolean(errors.port)}
                    className="w-20 flex-none text-center"
                    onChange={(event) => setField("port", event.target.value)}
                  />
                </InputGroup>
                <FieldError>{endpointError}</FieldError>
              </Field>

              <Separator />

              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-0">
                  认证方式
                </FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={form.authenticationMethod}
                  className="self-start"
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
                      className="min-w-16"
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>

              {form.authenticationMethod === "password" ? (
                <Field className="gap-1.5" data-invalid={Boolean(errors.password)}>
                  <FieldLabel htmlFor={`${formId}-password`}>登录密码</FieldLabel>
                  <SecretInput
                    id={`${formId}-password`}
                    value={form.password}
                    secretLabel="密码"
                    size="sm"
                    placeholder={isCredentialLoading ? "正在读取…" : "密码可留空"}
                    ariaInvalid={Boolean(errors.password)}
                    disabled={isCredentialLoading}
                    onChange={(value) => {
                      setCredentialEdits((current) => ({
                        ...current,
                        password: true,
                      }));
                      setField("password", value);
                    }}
                    onRevealStored={
                      canKeepCredential
                        ? () => revealStoredCredential("password")
                        : undefined
                    }
                  />
                  {canKeepCredential ? (
                    <FieldDescription>
                      点击小眼睛查看；输入新值后保存即可替换。
                    </FieldDescription>
                  ) : (
                    <FieldDescription>
                      可先保存空密码；连接前需要在编辑页补充。
                    </FieldDescription>
                  )}
                  <FieldError>{errors.password}</FieldError>
                </Field>
              ) : null}

              {form.authenticationMethod === "privateKey" ? (
                <FieldGroup className="gap-3">
                  <Field
                    className="gap-1.5"
                    data-invalid={Boolean(errors.privateKeyPath)}
                  >
                    <FieldLabel htmlFor={`${formId}-private-key`}>私钥路径</FieldLabel>
                    <Input
                      id={`${formId}-private-key`}
                      value={form.privateKeyPath}
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      density="compact"
                      placeholder="/Users/name/.ssh/id_ed25519"
                      aria-invalid={Boolean(errors.privateKeyPath)}
                      onChange={(event) =>
                        setField("privateKeyPath", event.target.value)
                      }
                    />
                    <FieldDescription>
                      仅保存本地路径，不复制私钥文件。
                    </FieldDescription>
                    <FieldError>{errors.privateKeyPath}</FieldError>
                  </Field>

                  <Field
                    className="gap-1.5"
                    data-invalid={Boolean(errors.privateKeyPassphrase)}
                  >
                    <FieldLabel htmlFor={`${formId}-private-key-passphrase`}>
                      私钥口令（可选）
                    </FieldLabel>
                    <SecretInput
                      id={`${formId}-private-key-passphrase`}
                      value={form.privateKeyPassphrase}
                      secretLabel="私钥口令"
                      size="sm"
                      placeholder={
                        isCredentialLoading ? "正在读取…" : "未加密私钥可留空"
                      }
                      ariaInvalid={Boolean(errors.privateKeyPassphrase)}
                      disabled={isCredentialLoading}
                      onChange={(value) => {
                        setCredentialEdits((current) => ({
                          ...current,
                          privateKeyPassphrase: true,
                        }));
                        setField("privateKeyPassphrase", value);
                      }}
                      onRevealStored={
                        canKeepCredential
                          ? () => revealStoredCredential("privateKeyPassphrase")
                          : undefined
                      }
                    />
                    <FieldDescription>
                      {canKeepCredential
                        ? "留空保留原口令；输入新值会替换已保存口令。"
                        : "仅加密私钥需要填写；口令会加密后保存在本机。"}
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

              {errors.form ? <FieldError>{errors.form}</FieldError> : null}
            </FieldGroup>
          </div>

          <Separator />
          <DialogFooter className="flex-row items-center justify-between px-4 py-3 sm:justify-between">
            <ConnectionTestControls
              key={testRevision}
              connectionId={connection?.id ?? null}
              disabled={isSaving}
              getInput={() => {
                const nextErrors = validateForm(form);
                delete nextErrors.name;
                if (Object.keys(nextErrors).length > 0) {
                  setErrors(nextErrors);
                  return null;
                }
                return {
                  ...toSaveConnectionInput(form, connection, credentialEdits),
                  name: form.name.trim() || "连接测试",
                };
              }}
            />
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? "保存中…" : isEditing ? "保存修改" : "保存连接"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getCredentialField(
  connection: ConnectionProfile,
): "password" | "privateKeyPassphrase" | null {
  if (connection.authenticationMethod === "password") {
    return "password";
  }
  if (connection.authenticationMethod === "privateKey") {
    return "privateKeyPassphrase";
  }
  return null;
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

function validateForm(form: ConnectionFormState): FormErrors {
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
  if (form.authenticationMethod === "privateKey" && !form.privateKeyPath.trim()) {
    errors.privateKeyPath = "请输入私钥文件路径。";
  }

  return errors;
}

function toSaveConnectionInput(
  form: ConnectionFormState,
  connection: ConnectionProfile | null,
  credentialEdits: CredentialEdits,
): SaveConnectionInput {
  const isAuthenticationChanged = Boolean(
    connection && connection.authenticationMethod !== form.authenticationMethod,
  );
  const isCredentialEdited =
    form.authenticationMethod === "password"
      ? credentialEdits.password
      : form.authenticationMethod === "privateKey"
        ? credentialEdits.privateKeyPassphrase
        : false;
  const shouldReplaceCredential =
    form.authenticationMethod !== "agent" &&
    (connection === null || isAuthenticationChanged || isCredentialEdited);
  const credentialValue =
    form.authenticationMethod === "password"
      ? form.password
      : form.authenticationMethod === "privateKey"
        ? form.privateKeyPassphrase
        : "";
  const clearCredential =
    form.authenticationMethod === "agent" ||
    ((isAuthenticationChanged || isCredentialEdited) && !credentialValue);

  return {
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim(),
    authenticationMethod: form.authenticationMethod,
    privateKeyPath:
      form.authenticationMethod === "privateKey" ? form.privateKeyPath.trim() : null,
    password:
      shouldReplaceCredential &&
      form.authenticationMethod === "password" &&
      form.password
        ? form.password
        : null,
    privateKeyPassphrase:
      shouldReplaceCredential &&
      form.authenticationMethod === "privateKey" &&
      form.privateKeyPassphrase
        ? form.privateKeyPassphrase
        : null,
    clearCredential,
  };
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
