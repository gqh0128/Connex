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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCommandError } from "@/lib/tauri/errors";
import type { RemoteFileEntry } from "@/types/sftp";

export type RemoteEntryNameAction =
  | { type: "createDirectory" }
  | { type: "createFile" }
  | { type: "rename"; entry: RemoteFileEntry };

type RemoteEntryNameDialogProps = {
  action: RemoteEntryNameAction;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
};

export function RemoteEntryNameDialog({
  action,
  onOpenChange,
  onSubmit,
}: RemoteEntryNameDialogProps) {
  const formId = useId();
  const [name, setName] = useState(action.type === "rename" ? action.entry.name : "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const copy = getNameDialogCopy(action);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const validationError = validateRemoteEntryName(normalizedName);
    if (validationError) {
      setNameError(validationError);
      return;
    }

    setNameError(null);
    setFormError(null);
    setIsSaving(true);
    try {
      await onSubmit(normalizedName);
      onOpenChange(false);
    } catch (error) {
      const commandError = getCommandError(error);
      if (commandError.field === "name") {
        setNameError(commandError.message);
      } else {
        setFormError(commandError.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isSaving) {
          onOpenChange(isOpen);
        }
      }}
    >
      <DialogContent showCloseButton={!isSaving}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-4">
            <Field className="gap-2" data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor={`${formId}-name`}>名称</FieldLabel>
              <Input
                id={`${formId}-name`}
                autoFocus
                value={name}
                aria-invalid={Boolean(nameError)}
                placeholder={copy.placeholder}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                  setFormError(null);
                }}
              />
              <FieldError>{nameError}</FieldError>
            </Field>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? copy.savingLabel : "确定"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RemoteEntryDeleteDialogProps = {
  entry: RemoteFileEntry;
  onOpenChange: (isOpen: boolean) => void;
  onDelete: () => Promise<void>;
};

export function RemoteEntryDeleteDialog({
  entry,
  onOpenChange,
  onDelete,
}: RemoteEntryDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (nextError) {
      setError(getCommandError(nextError).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(isOpen) => {
        if (!isDeleting) {
          onOpenChange(isOpen);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除“{entry.name}”？</AlertDialogTitle>
          <AlertDialogDescription>
            {entry.kind === "directory"
              ? "该操作无法撤销。为避免误删，Connex 只允许删除空文件夹。"
              : "该远程文件将被永久删除，此操作无法撤销。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
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
            {isDeleting ? "正在删除…" : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getNameDialogCopy(action: RemoteEntryNameAction) {
  switch (action.type) {
    case "createDirectory":
      return {
        title: "新建文件夹",
        description: "在当前远程目录中创建一个空文件夹。",
        placeholder: "文件夹名称",
        savingLabel: "正在创建…",
      };
    case "createFile":
      return {
        title: "新建文件",
        description: "在当前远程目录中创建一个空文件。",
        placeholder: "文件名称",
        savingLabel: "正在创建…",
      };
    case "rename":
      return {
        title: `重命名“${action.entry.name}”`,
        description: "新名称只会应用于当前远程目录中的这个条目。",
        placeholder: "新名称",
        savingLabel: "正在重命名…",
      };
  }
}

function validateRemoteEntryName(name: string) {
  if (!name) {
    return "请输入名称。";
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\0")) {
    return "名称不能是 .、..，也不能包含 /。";
  }
  if (new TextEncoder().encode(name).length > 255) {
    return "名称不能超过 255 个字节。";
  }
  return null;
}
