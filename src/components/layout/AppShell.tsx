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
import { FilePanel } from "@/features/sftp/components/FilePanel";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { TransferDrawer } from "@/features/transfers/components/TransferDrawer";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import { SessionTabs } from "./SessionTabs";
import { StatusBar } from "./StatusBar";
import { WIDE_WORKSPACE_QUERY } from "./layoutConstants";

type AppShellProps = {
  isFilePanelOpen: boolean;
  onFilePanelOpenChange: (isOpen: boolean) => void;
};

export function AppShell({ isFilePanelOpen, onFilePanelOpenChange }: AppShellProps) {
  const isWideWorkspace = useMediaQuery(WIDE_WORKSPACE_QUERY);
  const sidebarPanelRef = usePanelRef();
  const transferPanelRef = usePanelRef();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isTransferDrawerExpanded, setIsTransferDrawerExpanded] = useState(false);

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
  const transferLayout = useDefaultLayout({
    id: "connex-transfer-layout",
    panelIds: ["session", "transfers"],
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

  const handleTransferResize = (size: PanelSize) => {
    const isExpanded = size.inPixels > 40;
    setIsTransferDrawerExpanded((wasExpanded) =>
      wasExpanded === isExpanded ? wasExpanded : isExpanded,
    );
  };

  const handleTransferToggle = () => {
    if (transferPanelRef.current?.isCollapsed()) {
      transferPanelRef.current.resize(176);
      return;
    }

    transferPanelRef.current?.collapse();
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
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
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="workspace" minSize={560}>
          <main className="flex h-full min-w-0 flex-col bg-workspace">
            <SessionTabs
              isFilePanelOpen={isFilePanelOpen}
              onFilePanelToggle={() => onFilePanelOpenChange(!isFilePanelOpen)}
            />

            <ResizablePanelGroup
              orientation="vertical"
              className="min-h-0 flex-1"
              defaultLayout={transferLayout.defaultLayout}
              onLayoutChanged={transferLayout.onLayoutChanged}
            >
              <ResizablePanel id="session" minSize={280}>
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
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                id="transfers"
                panelRef={transferPanelRef}
                defaultSize={32}
                minSize={120}
                maxSize="40%"
                collapsedSize={32}
                collapsible
                groupResizeBehavior="preserve-pixel-size"
                onResize={handleTransferResize}
              >
                <TransferDrawer
                  isExpanded={isTransferDrawerExpanded}
                  onToggle={handleTransferToggle}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />

      <Sheet
        open={!isWideWorkspace && isFilePanelOpen}
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
