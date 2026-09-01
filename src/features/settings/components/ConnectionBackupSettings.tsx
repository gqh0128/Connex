import { Download, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";

import { ExportConnectionsDialog } from "./ExportConnectionsDialog";
import { ImportConnectionsDialog } from "./ImportConnectionsDialog";

type ConnectionBackupSettingsProps = {
  onImported: () => void;
};

export function ConnectionBackupSettings({
  onImported,
}: ConnectionBackupSettingsProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="backup-heading">
        <div className="flex flex-col gap-1">
          <h2 id="backup-heading" className="text-sm font-semibold">
            连接备份
          </h2>
          <p className="text-sm text-muted-foreground">
            将已保存连接迁移到另一台设备，或从 Connex 加密备份恢复。
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border bg-surface">
          <FieldGroup className="gap-0">
            <Field orientation="responsive" className="p-4">
              <FieldContent>
                <FieldTitle>导入与导出</FieldTitle>
                <FieldDescription>
                  导出必须设置密码，且默认包含已保存的密码与私钥口令。
                </FieldDescription>
              </FieldContent>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExportOpen(true)}
                >
                  <Download data-icon="inline-start" />
                  导出连接
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsImportOpen(true)}
                >
                  <Upload data-icon="inline-start" />
                  导入备份
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </div>
      </section>

      <ExportConnectionsDialog open={isExportOpen} onOpenChange={setIsExportOpen} />
      <ImportConnectionsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={onImported}
      />
    </>
  );
}
