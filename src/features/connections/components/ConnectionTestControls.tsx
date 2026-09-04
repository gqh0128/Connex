import { Check, Copy, LoaderCircle, ShieldAlert, XCircle } from "lucide-react";
import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { writeClipboardText } from "@/lib/clipboard";
import { testSshConnection } from "@/lib/tauri/connectionTesting";
import { getCommandError } from "@/lib/tauri/errors";
import type { SaveConnectionInput } from "@/types/connections";
import type { HostKeyChallenge, SessionFailure } from "@/types/sessions";

type ConnectionTestControlsProps = {
  connectionId: string | null;
  disabled: boolean;
  getInput: () => SaveConnectionInput | null;
};

type TestFailure = SessionFailure;

export function ConnectionTestControls({
  connectionId,
  disabled,
  getInput,
}: ConnectionTestControlsProps) {
  const requestGenerationRef = useRef(0);
  const pendingInputRef = useRef<SaveConnectionInput | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isFailureOpen, setIsFailureOpen] = useState(false);
  const [challenge, setChallenge] = useState<HostKeyChallenge | null>(null);
  const [challengeEndpoint, setChallengeEndpoint] = useState<string | null>(null);
  const [failure, setFailure] = useState<TestFailure | null>(null);
  const [isSuccessful, setIsSuccessful] = useState(false);

  const runTest = async (
    input: SaveConnectionInput,
    acceptedHostKey: HostKeyChallenge | null,
    shouldRememberHostKey: boolean,
  ) => {
    const requestGeneration = ++requestGenerationRef.current;
    setIsTesting(true);
    setChallenge(null);
    setChallengeEndpoint(null);
    setFailure(null);
    setIsSuccessful(false);

    try {
      const result = await testSshConnection({
        ...input,
        connectionId,
        acceptedHostKey,
        shouldRememberHostKey,
      });
      if (requestGeneration !== requestGenerationRef.current) {
        return;
      }

      if (result.status === "success") {
        pendingInputRef.current = null;
        setIsSuccessful(true);
        return;
      }

      if (result.status === "hostKeyRequired") {
        pendingInputRef.current = input;
        setChallenge(result.hostKey);
        setChallengeEndpoint(`${input.host}:${input.port}`);
        return;
      }

      showFailure(result.failure);
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) {
        return;
      }
      const commandError = getCommandError(error);
      showFailure({
        code: "internal",
        message: `${commandError.message}（${commandError.code}）`,
      });
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setIsTesting(false);
      }
    }
  };

  const showFailure = (nextFailure: SessionFailure) => {
    pendingInputRef.current = null;
    setFailure(nextFailure);
    setIsFailureOpen(true);
  };

  const startTest = () => {
    if (isTesting) {
      return;
    }
    const input = getInput();
    if (input) {
      void runTest(input, null, false);
    }
  };

  const decideHostKey = (shouldRememberHostKey: boolean) => {
    const input = pendingInputRef.current;
    const acceptedHostKey = challenge;
    if (!input || !acceptedHostKey || isTesting) {
      return;
    }
    void runTest(input, acceptedHostKey, shouldRememberHostKey);
  };

  const dismissHostKey = () => {
    requestGenerationRef.current += 1;
    pendingInputRef.current = null;
    setChallenge(null);
    setChallengeEndpoint(null);
    setIsTesting(false);
  };

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isTesting}
          onClick={startTest}
        >
          {isTesting ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : null}
          {isTesting ? "测试中…" : "测试连接"}
        </Button>

        <div className="grid w-48 min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1">
          {isSuccessful ? (
            <p className="col-span-2 flex items-center gap-1 truncate text-xs font-medium text-success">
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
              连接成功
            </p>
          ) : failure ? (
            <>
              <p className="truncate text-xs text-destructive" title={failure.message}>
                {failure.message}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="复制连接错误"
                title="复制完整错误信息"
                onClick={() => {
                  void writeClipboardText(failure.message).catch(() => undefined);
                }}
              >
                <Copy />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={Boolean(challenge)}
        onOpenChange={(open) => {
          if (!open) {
            dismissHostKey();
          }
        }}
      >
        <AlertDialogContent className="gap-5">
          <AlertDialogHeader className="gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <ShieldAlert className="size-5" aria-hidden="true" />
              </div>
              <AlertDialogTitle>确认服务器身份</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              测试连接前，请通过可信渠道核对服务器主机密钥指纹。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {challenge && challengeEndpoint ? (
            <dl className="grid gap-3 rounded-lg border bg-muted/30 px-4 py-3.5 text-sm">
              <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">服务器</dt>
                <dd className="min-w-0 break-all font-medium">{challengeEndpoint}</dd>
              </div>
              <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">算法</dt>
                <dd className="min-w-0 break-all font-mono text-xs">
                  {challenge.keyAlgorithm}
                </dd>
              </div>
              <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">SHA-256</dt>
                <dd className="min-w-0 select-text break-all font-mono text-xs leading-5">
                  {challenge.fingerprintSha256}
                </dd>
              </div>
            </dl>
          ) : null}

          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={dismissHostKey}>
              取消测试
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isTesting}
              onClick={() => decideHostKey(false)}
            >
              仅本次信任
            </Button>
            <Button
              type="button"
              disabled={isTesting}
              onClick={() => decideHostKey(true)}
            >
              信任并保存
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isFailureOpen} onOpenChange={setIsFailureOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <XCircle className="size-5" aria-hidden="true" />
              </div>
              <AlertDialogTitle>连接失败</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              测试未通过，请检查以下错误信息后修改连接参数。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {failure ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs leading-5 text-destructive">
              {failure.message}
            </pre>
          ) : null}

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (failure) {
                  void writeClipboardText(failure.message).catch(() => undefined);
                }
              }}
            >
              <Copy data-icon="inline-start" />
              复制错误
            </Button>
            <Button type="button" onClick={() => setIsFailureOpen(false)}>
              关闭
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
