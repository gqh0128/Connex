import { LogOut } from "lucide-react";

import type { ExitConfirmationController } from "@/app/useExitConfirmation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

type ExitConfirmationDialogProps = {
  controller: ExitConfirmationController;
};

export function ExitConfirmationDialog({ controller }: ExitConfirmationDialogProps) {
  return (
    <AlertDialog
      open={controller.isPromptOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          controller.cancelExit();
        }
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <LogOut className="size-4.5" />
            </div>
            <AlertDialogTitle>退出 Connex？</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            当前 SSH 会话和正在进行的文件传输都会被关闭。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field orientation="horizontal" data-disabled={controller.isExiting}>
          <Checkbox
            id="remember-exit-choice"
            checked={controller.shouldRememberChoice}
            disabled={controller.isExiting}
            onCheckedChange={(checked) =>
              controller.setShouldRememberChoice(checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor="remember-exit-choice">记住我的选择</FieldLabel>
            <FieldDescription>以后关闭窗口时直接退出，不再询问。</FieldDescription>
          </FieldContent>
        </Field>

        {controller.exitError ? (
          <p role="alert" className="text-sm text-destructive">
            {controller.exitError.message}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={controller.isExiting}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={controller.isExiting}
            onClick={(event) => {
              event.preventDefault();
              void controller.confirmExit();
            }}
          >
            {controller.isExiting ? "正在退出…" : "退出"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
