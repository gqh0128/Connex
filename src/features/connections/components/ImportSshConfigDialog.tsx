import { FileInput, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getCommandError } from "@/lib/tauri/errors";
import { importSshConfig, previewSshConfigImport } from "@/lib/tauri/sshConfig";
import { cn } from "@/lib/utils";
import type {
  SshConfigConflictStrategy,
  SshConfigImportResult,
  SshConfigPreview,
  SshConfigPreviewItem,
} from "@/types/sshConfig";

type ImportSshConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

export function ImportSshConfigDialog({
  open,
  onOpenChange,
  onImported,
}: ImportSshConfigDialogProps) {
  const [preview, setPreview] = useState<SshConfigPreview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [conflictStrategy, setConflictStrategy] =
    useState<SshConfigConflictStrategy>("overwrite");
  const [result, setResult] = useState<SshConfigImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  const selectableItems = useMemo(
    () => preview?.items.filter((item) => item.status !== "skipped") ?? [],
    [preview],
  );
  const counts = useMemo(() => countStatuses(preview?.items ?? []), [preview]);
  const selectedCount = selectableItems.filter((item) => selectedKeys.has(item.key)).length;
  const isAllSelected = selectableItems.length > 0 && selectedCount === selectableItems.length;
  const isPartiallySelected = selectedCount > 0 && !isAllSelected;

  useEffect(() => {
    if (!open) {
      return;
    }
    let isActive = true;
    void previewSshConfigImport()
      .then((nextPreview) => {
        if (!isActive) {
          return;
        }
        setPreview(nextPreview);
        setSelectedKeys(
          new Set(
            nextPreview.items
              .filter((item) => item.status !== "skipped")
            .map((item) => item.key),
          ),
        );
      })
      .catch((scanError: unknown) => {
        if (!isActive) {
          return;
        }
        setError(getCommandError(scanError).message);
      })
      .finally(() => {
        if (isActive) {
          setIsScanning(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [open]);

  const scanConfig = async () => {
    setIsScanning(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await previewSshConfigImport();
      setPreview(nextPreview);
      setSelectedKeys(
        new Set(
          nextPreview.items
            .filter((item) => item.status !== "skipped")
            .map((item) => item.key),
        ),
      );
    } catch (scanError) {
      setPreview(null);
      setError(getCommandError(scanError).message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleImport = async () => {
    if (!preview || selectedKeys.size === 0) {
      setError("请至少选择一个可导入的连接。");
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const importResult = await importSshConfig({
        fingerprint: preview.fingerprint,
        selectedKeys: [...selectedKeys],
        conflictStrategy,
      });
      setResult(importResult);
      onImported();
    } catch (importError) {
      setError(getCommandError(importError).message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (isScanning || isImporting)) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-3 p-4 sm:max-w-3xl">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="text-base">导入 SSH config</DialogTitle>
          <DialogDescription>
            扫描 <code>~/.ssh/config</code>，确认候选项和冲突策略后批量写入。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div role="status" className="py-4 text-sm">
            <p className="font-medium">SSH 连接已导入。</p>
            <p className="mt-1 text-muted-foreground">
              新增 {result.importedCount} 个，覆盖 {result.overwrittenCount} 个，保留副本{" "}
              {result.duplicatedCount} 个，跳过 {result.skippedCount} 个。
            </p>
          </div>
        ) : isScanning ? (
          <div role="status" className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" />
            正在扫描 SSH config…
          </div>
        ) : preview ? (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="secondary">{counts.ready} 个可导入</Badge>
              <Badge variant={counts.conflict > 0 ? "outline" : "secondary"}>
                {counts.conflict} 个冲突
              </Badge>
              <Badge variant={counts.skipped > 0 ? "outline" : "secondary"}>
                {counts.skipped} 个跳过
              </Badge>
              <span className="ml-auto max-w-72 truncate text-muted-foreground" title={preview.sourcePath}>
                {preview.sourcePath}
              </span>
            </div>

            {counts.conflict > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span id="ssh-config-conflict-label" className="shrink-0 text-xs font-medium">
                  同名冲突
                </span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={conflictStrategy}
                  aria-labelledby="ssh-config-conflict-label"
                  onValueChange={(value) => {
                    if (isConflictStrategy(value)) {
                      setConflictStrategy(value);
                    }
                  }}
                >
                  <ToggleGroupItem value="overwrite" className="h-7 px-3">
                    覆盖
                  </ToggleGroupItem>
                  <ToggleGroupItem value="skip" className="h-7 px-3">
                    跳过
                  </ToggleGroupItem>
                  <ToggleGroupItem value="keepBoth" className="h-7 px-3">
                    保留两份
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[24px_minmax(120px,0.8fr)_minmax(180px,1.3fr)_110px] items-center gap-2 border-b bg-muted/45 px-2.5 py-1.5 text-xs text-muted-foreground">
                <Checkbox
                  aria-label="选择全部可导入连接"
                  checked={isPartiallySelected ? "indeterminate" : isAllSelected}
                  disabled={selectableItems.length === 0}
                  onCheckedChange={(checked) => {
                    setSelectedKeys(
                      checked
                        ? new Set(selectableItems.map((item) => item.key))
                        : new Set(),
                    );
                  }}
                />
                <span>名称</span>
                <span>目标</span>
                <span>状态</span>
              </div>
              <ScrollArea className="h-72">
                {preview.items.length > 0 ? (
                  <div>
                    {preview.items.map((item) => (
                      <SshConfigRow
                        key={item.key}
                        item={item}
                        isSelected={selectedKeys.has(item.key)}
                        onSelectedChange={(isSelected) => {
                          setSelectedKeys((current) => {
                            const next = new Set(current);
                            if (isSelected) {
                              next.add(item.key);
                            } else {
                              next.delete(item.key);
                            }
                            return next;
                          });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    没有找到可预览的静态 Host。
                  </div>
                )}
              </ScrollArea>
            </div>

            {preview.warnings.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                {preview.warnings.map((warning) => (
                  <p key={warning}>• {warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-1">
          {result ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              完成
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isScanning || isImporting}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isScanning || isImporting}
                onClick={() => void scanConfig()}
              >
                <RefreshCw data-icon="inline-start" />
                重新扫描
              </Button>
              <Button
                type="button"
                disabled={!preview || selectedKeys.size === 0 || isImporting}
                onClick={() => void handleImport()}
              >
                <FileInput data-icon="inline-start" />
                {isImporting ? "正在导入…" : `导入 ${selectedKeys.size} 个`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SshConfigRowProps = {
  item: SshConfigPreviewItem;
  isSelected: boolean;
  onSelectedChange: (selected: boolean) => void;
};

function SshConfigRow({ item, isSelected, onSelectedChange }: SshConfigRowProps) {
  const isDisabled = item.status === "skipped";
  const source = sourceLabel(item);
  const detail = item.reason ?? item.warnings[0];
  const secondaryText = detail ? `${detail} · ${source}` : source;
  return (
    <div
      className={cn(
        "grid min-h-12 grid-cols-[24px_minmax(120px,0.8fr)_minmax(180px,1.3fr)_110px] items-center gap-2 border-b px-2.5 py-1.5 text-sm last:border-b-0",
        isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/45",
      )}
      onClick={() => {
        if (!isDisabled) {
          onSelectedChange(!isSelected);
        }
      }}
    >
      <span onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`选择 ${item.alias}`}
          checked={isSelected}
          disabled={isDisabled}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{item.alias}</span>
        <span
          className="block truncate text-xs text-muted-foreground"
          title={`${secondaryText} · ${item.sourcePath}:${item.lineNumber}`}
        >
          {secondaryText}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate tabular-nums" title={`${item.username}@${item.host}:${item.port}`}>
          {item.username}@{item.host}:{item.port}
        </span>
        <span className="block truncate text-xs text-muted-foreground" title={item.privateKeyPath ?? "SSH Agent"}>
          {item.privateKeyPath ?? "SSH Agent"}
        </span>
      </span>
      <StatusBadge status={item.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: SshConfigPreviewItem["status"] }) {
  if (status === "ready") {
    return <Badge variant="secondary">可导入</Badge>;
  }
  if (status === "conflict") {
    return <Badge variant="outline">同名冲突</Badge>;
  }
  return <Badge variant="outline">已跳过</Badge>;
}

function countStatuses(items: SshConfigPreviewItem[]) {
  return items.reduce(
    (counts, item) => ({ ...counts, [item.status]: counts[item.status] + 1 }),
    { ready: 0, conflict: 0, skipped: 0 },
  );
}

function sourceLabel(item: SshConfigPreviewItem) {
  const fileName = item.sourcePath.split(/[\\/]/).pop() ?? item.sourcePath;
  return `${fileName}:${item.lineNumber}`;
}

function isConflictStrategy(value: string): value is SshConfigConflictStrategy {
  return value === "overwrite" || value === "skip" || value === "keepBoth";
}
