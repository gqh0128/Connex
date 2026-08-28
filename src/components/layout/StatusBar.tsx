import { ArrowDownToLine, LockKeyhole } from "lucide-react";

export function StatusBar() {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
        未连接
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <ArrowDownToLine className="size-3" />0 个传输
        </span>
        <span className="flex items-center gap-1.5">
          <LockKeyhole className="size-3" />
          本地安全存储
        </span>
        <span>Connex 0.1.0</span>
      </div>
    </footer>
  );
}
