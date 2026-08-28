import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getCommandError } from "@/lib/tauri/errors";
import type { HostKeyDecision } from "@/types/sessions";

import type { SshSessionTab } from "../sessionTypes";

type HostKeyVerificationDialogProps = {
  tab: SshSessionTab | null;
  onDecision: (localId: string, decision: HostKeyDecision) => Promise<void>;
};

export function HostKeyVerificationDialog({
  tab,
  onDecision,
}: HostKeyVerificationDialogProps) {
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const challenge = tab?.snapshot?.hostKeyChallenge;

  const decide = async (decision: HostKeyDecision) => {
    if (!tab || isDeciding) {
      return;
    }

    setIsDeciding(true);
    setDecisionError(null);
    try {
      await onDecision(tab.localId, decision);
    } catch (error) {
      setDecisionError(getCommandError(error).message);
      setIsDeciding(false);
    }
  };

  return (
    <AlertDialog
      open={Boolean(tab && challenge)}
      onOpenChange={(open) => {
        if (!open) {
          void decide("reject");
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
            这是 Connex
            首次连接该服务器。请通过可信渠道核对主机密钥指纹，再决定是否继续。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {tab && challenge ? (
          <dl className="grid gap-3 rounded-lg border bg-muted/30 px-4 py-3.5 text-sm">
            <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted-foreground">服务器</dt>
              <dd className="min-w-0 break-all font-medium">
                {tab.profile.host}:{tab.profile.port}
              </dd>
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

        {decisionError ? (
          <p role="alert" className="text-sm text-destructive">
            {decisionError}
          </p>
        ) : null}

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isDeciding}
            onClick={() => void decide("reject")}
          >
            取消连接
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isDeciding}
            onClick={() => void decide("acceptOnce")}
          >
            仅本次信任
          </Button>
          <Button
            type="button"
            disabled={isDeciding}
            onClick={() => void decide("acceptAndRemember")}
          >
            {isDeciding ? "正在继续…" : "信任并保存"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
