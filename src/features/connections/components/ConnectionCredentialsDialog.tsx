import { KeyRound, LockKeyhole } from "lucide-react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ConnectionProfile } from "@/types/connections";
import type { SessionCredentials } from "@/types/sessions";

type ConnectionCredentialsDialogProps = {
  connection: ConnectionProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (credentials: SessionCredentials) => void;
};

export function ConnectionCredentialsDialog({
  connection,
  open,
  onOpenChange,
  onConnect,
}: ConnectionCredentialsDialogProps) {
  const inputId = useId();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!connection || connection.authenticationMethod === "agent") {
    return null;
  }

  const isPassword = connection.authenticationMethod === "password";
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSecret("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isPassword && !secret) {
      setError("请输入 SSH 登录密码。");
      return;
    }

    onConnect({
      password: isPassword ? secret : null,
      privateKeyPassphrase: isPassword || !secret ? null : secret,
    });
    setSecret("");
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {isPassword ? (
                <LockKeyhole className="size-4" />
              ) : (
                <KeyRound className="size-4" />
              )}
            </div>
            <DialogTitle>{isPassword ? "输入登录密码" : "输入私钥口令"}</DialogTitle>
            <DialogDescription>
              连接到 {connection.username}@{connection.host}:{connection.port}
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={inputId}>
              {isPassword ? "密码" : "私钥口令（可选）"}
            </FieldLabel>
            <Input
              id={inputId}
              type="password"
              autoFocus
              autoComplete="off"
              value={secret}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setSecret(event.target.value);
                setError(null);
              }}
            />
            <FieldDescription>
              本次输入仅用于当前连接，不会写入连接配置或本地数据库。
            </FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit">连接</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
