import { Settings2 } from "lucide-react";
import { useState } from "react";
import { useDefaultLayout, usePanelRef, type PanelSize } from "react-resizable-panels";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConnectionSidebar } from "@/features/connections/components/ConnectionSidebar";
import { SettingsWorkspace } from "@/features/settings/components/SettingsWorkspace";
import { FilePanel } from "@/features/sftp/components/FilePanel";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { AppView } from "@/types/navigation";

import { AppTitleBar } from "./AppTitleBar";
import { SessionTabs } from "./SessionTabs";
import { StatusBar } from "./StatusBar";
import { WIDE_WORKSPACE_QUERY } from "./layoutConstants";

type AppShellProps = {
  isFilePanelOpen: boolean;
  onFilePanelOpenChange: (isOpen: boolean) => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
};

export function AppShell({
  isFilePanelOpen,
  onFilePanelOpenChange,
  activeView,
  onViewChange,
}: AppShellProps) {
  const isWideWorkspace = useMediaQuery(WIDE_WORKSPACE_QUERY);
  const sidebarPanelRef = usePanelRef();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const shellLayout = useDefaultLayout({
    id: "connex-shell-layout",
    panelIds: ["connections", "workspace"],
    storage: window.localStorage,
  });
  const fileLayout = useDefaultLayout({
    id: "connex-file-layout",
    panelIds: ["terminal", "files"],
    storage: window.localStorage,
  });
  const handleSidebarResize = (size: PanelSize) => {
    const isCollapsed = size.inPixels <= 64;
    setIsSidebarCollapsed((wasCollapsed) =>
      wasCollapsed === isCollapsed ? wasCollapsed : isCollapsed,
    );
  };

  const handleSidebarToggle = () => {
    if (sidebarPanelRef.current?.isCollapsed()) {
      sidebarPanelRef.current.expand();
      return;
    }

    sidebarPanelRef.current?.collapse();
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <AppTitleBar activeView={activeView} onViewChange={onViewChange} />

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={shellLayout.defaultLayout}
        onLayoutChanged={shellLayout.onLayoutChanged}
      >
        <ResizablePanel
          id="connections"
          panelRef={sidebarPanelRef}
          defaultSize={248}
          minSize={224}
          maxSize={320}
          collapsedSize={56}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleSidebarResize}
        >
          <ConnectionSidebar
            isCollapsed={isSidebarCollapsed}
            onCollapseToggle={handleSidebarToggle}
            activeView={activeView}
            onViewChange={onViewChange}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="workspace" minSize={560}>
          <main className="flex h-full min-w-0 flex-col bg-workspace">
            {activeView === "settings" ? (
              <>
                <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-surface px-4">
                  <Settings2 className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">设置</span>
                </header>
                <SettingsWorkspace />
              </>
            ) : (
              <>
                <SessionTabs
                  isFilePanelOpen={isFilePanelOpen}
                  onFilePanelToggle={() => onFilePanelOpenChange(!isFilePanelOpen)}
                />

                <div className="min-h-0 flex-1">
                  {isWideWorkspace && isFilePanelOpen ? (
                    <ResizablePanelGroup
                      orientation="horizontal"
                      defaultLayout={fileLayout.defaultLayout}
                      onLayoutChanged={fileLayout.onLayoutChanged}
                    >
                      <ResizablePanel id="terminal" minSize={560}>
                        <TerminalWorkspace />
                      </ResizablePanel>
                      <ResizableHandle />
                      <ResizablePanel
                        id="files"
                        defaultSize={320}
                        minSize={280}
                        maxSize={520}
                        groupResizeBehavior="preserve-pixel-size"
                      >
                        <FilePanel />
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : (
                    <TerminalWorkspace />
                  )}
                </div>
              </>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />

      <Sheet
        open={activeView === "workspace" && !isWideWorkspace && isFilePanelOpen}
        onOpenChange={onFilePanelOpenChange}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[min(26rem,86vw)] max-w-none gap-0 p-0 sm:max-w-none"
        >
          <SheetTitle className="sr-only">远程文件</SheetTitle>
          <SheetDescription className="sr-only">
            浏览远程目录并管理文件传输。
          </SheetDescription>
          <FilePanel
            className="h-full border-l-0"
            onClose={() => onFilePanelOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
