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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCommandError } from "@/lib/tauri/errors";
import type {
  AuthenticationMethod,
  ConnectionProfile,
  SaveConnectionInput,
} from "@/types/connections";

type ConnectionFormSheetProps = {
  open: boolean;
  connection: ConnectionProfile | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: SaveConnectionInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
};

type ConnectionFormState = Omit<SaveConnectionInput, "port" | "privateKeyPath"> & {
  port: string;
  privateKeyPath: string;
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

export function ConnectionFormSheet({
  open,
  connection,
  onOpenChange,
  onSubmit,
  onDelete,
}: ConnectionFormSheetProps) {
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

  const setField = <Field extends keyof ConnectionFormState>(
    field: Field,
    value: ConnectionFormState[Field],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
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
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        username: form.username.trim(),
        authenticationMethod: form.authenticationMethod,
        privateKeyPath:
          form.authenticationMethod === "privateKey"
            ? form.privateKeyPath.trim()
            : null,
      });
      onOpenChange(false);
    } catch (error) {
      const commandError = getCommandError(error);
      const field = isFormField(commandError.field) ? commandError.field : "form";
      setErrors({ [field]: commandError.message });
    } finally {
      setIsSaving(false);
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
      onOpenChange(false);
    } catch (error) {
      setDeleteError(getCommandError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(30rem,92vw)] gap-0 sm:max-w-none">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "编辑 SSH 连接" : "新建 SSH 连接"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "修改连接地址和认证方式。保存后不会影响已打开的会话。"
              : "保存连接地址和认证方式。密码会在连接时单独获取，不会写入数据库。"}
          </SheetDescription>
        </SheetHeader>

        <form
          id={formId}
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <FieldGroup>
              <Field data-invalid={Boolean(errors.name)}>
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

              <FieldGroup className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
                <Field data-invalid={Boolean(errors.host)}>
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

                <Field data-invalid={Boolean(errors.port)}>
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

              <Field data-invalid={Boolean(errors.username)}>
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

              <FieldSet>
                <FieldLegend variant="label">认证方式</FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
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
                <FieldDescription>
                  密码和私钥口令只会在连接时进入安全凭据流程。
                </FieldDescription>
              </FieldSet>

              {form.authenticationMethod === "privateKey" ? (
                <Field data-invalid={Boolean(errors.privateKeyPath)}>
                  <FieldLabel htmlFor={`${formId}-private-key`}>私钥路径</FieldLabel>
                  <Input
                    id={`${formId}-private-key`}
                    value={form.privateKeyPath}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="/Users/name/.ssh/id_ed25519"
                    aria-invalid={Boolean(errors.privateKeyPath)}
                    onChange={(event) => setField("privateKeyPath", event.target.value)}
                  />
                  <FieldDescription>
                    只保存本地路径，不复制私钥文件内容。
                  </FieldDescription>
                  <FieldError>{errors.privateKeyPath}</FieldError>
                </Field>
              ) : null}

              {errors.form ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter className="border-t sm:flex-row sm:items-center sm:justify-end">
            {isEditing && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
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
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "保存中…" : isEditing ? "保存修改" : "保存连接"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{connection?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              连接地址和认证配置将从本机移除。此操作不会删除服务器上的任何数据。
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
    </Sheet>
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
    };
  }

  return {
    name: connection.name,
    host: connection.host,
    port: String(connection.port),
    username: connection.username,
    authenticationMethod: connection.authenticationMethod,
    privateKeyPath: connection.privateKeyPath ?? "",
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

function isFormField(field: string | null): field is FormField {
  return (
    field === "name" ||
    field === "host" ||
    field === "port" ||
    field === "username" ||
    field === "authenticationMethod" ||
    field === "privateKeyPath"
  );
}
