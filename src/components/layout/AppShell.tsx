import { cn } from "@/lib/utils";
import { ConnectionSidebar } from "@/features/connections/components/ConnectionSidebar";
import { FilePanel } from "@/features/sftp/components/FilePanel";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";

import { SessionTabs } from "./SessionTabs";
import { StatusBar } from "./StatusBar";

type AppShellProps = {
  isFilePanelOpen: boolean;
  onFilePanelToggle: () => void;
};

export function AppShell({
  isFilePanelOpen,
  onFilePanelToggle,
}: AppShellProps) {
  return (
    <div className="grid h-svh grid-cols-[15.5rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_1.5rem] overflow-hidden bg-background text-foreground">
      <ConnectionSidebar />

      <main className="flex min-w-0 flex-col bg-workspace">
        <SessionTabs
          isFilePanelOpen={isFilePanelOpen}
          onFilePanelToggle={onFilePanelToggle}
        />

        <div
          className={cn(
            "grid min-h-0 flex-1",
            isFilePanelOpen
              ? "grid-cols-[minmax(0,1fr)_19rem]"
              : "grid-cols-1",
          )}
        >
          <TerminalWorkspace />
          {isFilePanelOpen ? <FilePanel /> : null}
        </div>
      </main>

      <StatusBar />
    </div>
  );
}
