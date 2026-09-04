import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  ConnectionSidebar,
  type ConnectionSidebarHandle,
} from "@/features/connections/components/ConnectionSidebar";
import { SettingsWorkspace } from "@/features/settings/components/SettingsWorkspace";
import { FilePanel } from "@/features/sftp/components/FilePanel";
import { useRemoteFiles } from "@/features/sftp/hooks/useRemoteFiles";
import { HostKeyVerificationDialog } from "@/features/terminal/components/HostKeyVerificationDialog";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import type { SshSessionsController } from "@/features/terminal/hooks/useSshSessions";
import type { TerminalFontsController } from "@/features/terminal/hooks/useTerminalFonts";
import type { TerminalThemeProfileId } from "@/features/terminal/terminalThemeProfiles";
import { getTerminalBoldFontWeight } from "@/features/terminal/terminalFontWeight";
import { useFileTransfers } from "@/features/transfers/hooks/useFileTransfers";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { hasPrimaryShortcutModifier } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { AppPreferences } from "@/types/app";
import {
  WORKSPACE_PAGE_DEFINITIONS,
  type AppView,
  type WorkspacePageId,
  type WorkspacePageTab,
} from "@/types/navigation";
import type { RemoteFileEntry } from "@/types/sftp";

import { AppTitleBar } from "./AppTitleBar";
import { SessionTabs } from "./SessionTabs";
import { StatusBar } from "./StatusBar";
import { WIDE_WORKSPACE_QUERY } from "./layoutConstants";

type AppShellProps = {
  isFilePanelOpen: boolean;
  onFilePanelOpenChange: (isOpen: boolean) => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  pageTabs: WorkspacePageTab[];
  onPageOpen: (pageId: WorkspacePageId) => void;
  onPageClose: (pageId: WorkspacePageId) => void;
  appPreferences: AppPreferences;
  isAppPreferencesLoading: boolean;
  appPreferencesError: string | null;
  interfaceScaleError: string | null;
  onAppPreferencesChange: (changes: Partial<AppPreferences>) => Promise<AppPreferences>;
  terminalThemeProfileId: TerminalThemeProfileId;
  terminalFonts: TerminalFontsController;
  sshSessions: SshSessionsController;
};

export function AppShell({
  isFilePanelOpen,
  onFilePanelOpenChange,
  activeView,
  onViewChange,
  pageTabs,
  onPageOpen,
  onPageClose,
  appPreferences,
  isAppPreferencesLoading,
  appPreferencesError,
  interfaceScaleError,
  onAppPreferencesChange,
  terminalThemeProfileId,
  terminalFonts,
  sshSessions,
}: AppShellProps) {
  const isWideWorkspace = useMediaQuery(WIDE_WORKSPACE_QUERY);
  const sidebarPanelRef = usePanelRef();
  const filePanelRef = usePanelRef();
  const connectionSidebarRef = useRef<ConnectionSidebarHandle>(null);
  const { activeTabId } = sshSessions;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeSession = sshSessions.activeTab?.snapshot ?? null;
  const isRemoteFilesEnabled = activeView === "workspace" && isFilePanelOpen;
  const remoteFiles = useRemoteFiles(activeSession, isRemoteFilesEnabled);
  const fileTransfers = useFileTransfers();
  const activeSessionIdRef = useRef(activeSession?.id ?? null);
  const remoteFilesRef = useRef(remoteFiles);

  const shellLayout = useDefaultLayout({
    id: "connex-shell-layout-v2",
    panelIds: ["connections", "workspace"],
    storage: window.localStorage,
  });
  const fileLayout = useDefaultLayout({
    id: "connex-file-layout",
    panelIds: ["terminal", "files"],
    storage: window.localStorage,
  });
  const handleSidebarResize = (size: PanelSize) => {
    const isCollapsed = size.inPixels <= 1;
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

  const openNewConnection = useCallback(() => {
    onViewChange("workspace");
    connectionSidebarRef.current?.openCreateForm();
  }, [onViewChange]);

  const openSshConfigImport = useCallback(() => {
    onViewChange("workspace");
    connectionSidebarRef.current?.openSshConfigImport();
  }, [onViewChange]);

  const updateTerminalFontSize = useCallback(
    async (fontSize: number) =>
      (await onAppPreferencesChange({ terminalFontSize: fontSize })).terminalFontSize,
    [onAppPreferencesChange],
  );

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
    remoteFilesRef.current = remoteFiles;
  }, [activeSession?.id, remoteFiles]);

  const uploadFiles = useCallback(() => {
    const session = activeSession;
    const remoteDirectory = remoteFiles.directory?.path;
    if (!session || session.state !== "connected" || !remoteDirectory) {
      return;
    }

    const sessionId = session.id;
    void fileTransfers.selectAndUpload({
      sessionId,
      connectionName: session.connectionName,
      remoteDirectory,
      onCompleted: () => {
        const currentRemoteFiles = remoteFilesRef.current;
        if (
          activeSessionIdRef.current === sessionId &&
          currentRemoteFiles.directory?.path === remoteDirectory
        ) {
          currentRemoteFiles.refresh();
        }
      },
    });
  }, [activeSession, fileTransfers, remoteFiles.directory?.path]);

  const uploadFolder = useCallback(() => {
    const session = activeSession;
    const remoteDirectory = remoteFiles.directory?.path;
    if (!session || session.state !== "connected" || !remoteDirectory) {
      return;
    }

    const sessionId = session.id;
    void fileTransfers.selectAndUploadFolder({
      sessionId,
      connectionName: session.connectionName,
      remoteDirectory,
      onCompleted: () => {
        const currentRemoteFiles = remoteFilesRef.current;
        if (
          activeSessionIdRef.current === sessionId &&
          currentRemoteFiles.directory?.path === remoteDirectory
        ) {
          currentRemoteFiles.refresh();
        }
      },
    });
  }, [activeSession, fileTransfers, remoteFiles.directory?.path]);

  const downloadFile = useCallback(
    (entry: RemoteFileEntry) => {
      const session = activeSession;
      if (!session || session.state !== "connected" || entry.kind !== "file") {
        return;
      }

      void fileTransfers.selectAndDownload({
        sessionId: session.id,
        connectionName: session.connectionName,
        entry,
      });
    },
    [activeSession, fileTransfers],
  );

  const downloadFolder = useCallback(
    (entry: RemoteFileEntry) => {
      const session = activeSession;
      if (!session || session.state !== "connected" || entry.kind !== "directory") {
        return;
      }

      void fileTransfers.selectAndDownloadFolder({
        sessionId: session.id,
        connectionName: session.connectionName,
        entry,
      });
    },
    [activeSession, fileTransfers],
  );

  const cancelTransfersForTabs = useCallback(
    (localIds: string[]) => {
      const closingIds = new Set(localIds);
      for (const tab of sshSessions.tabs) {
        if (closingIds.has(tab.localId) && tab.snapshot) {
          fileTransfers.cancelTransfersForSession(tab.snapshot.id);
        }
      }
    },
    [fileTransfers, sshSessions.tabs],
  );

  const closeSession = useCallback(
    (localId: string) => {
      cancelTransfersForTabs([localId]);
      sshSessions.closeSession(localId);
    },
    [cancelTransfersForTabs, sshSessions],
  );

  const closeOtherSessions = useCallback(
    (localId: string) => {
      cancelTransfersForTabs(
        sshSessions.tabs
          .filter((tab) => tab.localId !== localId)
          .map((tab) => tab.localId),
      );
      sshSessions.closeOtherSessions(localId);
    },
    [cancelTransfersForTabs, sshSessions],
  );

  const closeSessionsToRight = useCallback(
    (localId: string) => {
      const tabIndex = sshSessions.tabs.findIndex((tab) => tab.localId === localId);
      if (tabIndex >= 0) {
        cancelTransfersForTabs(
          sshSessions.tabs.slice(tabIndex + 1).map((tab) => tab.localId),
        );
      }
      sshSessions.closeSessionsToRight(localId);
    },
    [cancelTransfersForTabs, sshSessions],
  );

  const reconnectSession = useCallback(
    (localId: string) => {
      cancelTransfersForTabs([localId]);
      sshSessions.reconnectSession(localId);
    },
    [cancelTransfersForTabs, sshSessions],
  );

  useLayoutEffect(() => {
    const filePanel = filePanelRef.current;
    if (!filePanel) {
      return;
    }

    if (isWideWorkspace && isFilePanelOpen) {
      filePanel.expand();
    } else {
      filePanel.collapse();
    }
  }, [filePanelRef, isFilePanelOpen, isWideWorkspace]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hasPrimaryShortcutModifier(event)) {
        return;
      }

      if (event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        openNewConnection();
        return;
      }

      if (event.key.toLocaleLowerCase() === "w") {
        if (activeView !== "workspace") {
          event.preventDefault();
          onPageClose(activeView);
          return;
        }

        if (activeTabId) {
          event.preventDefault();
          closeSession(activeTabId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, activeView, closeSession, onPageClose, openNewConnection]);

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <AppTitleBar
        activeView={activeView}
        activeContextLabel={sshSessions.activeTab?.profile.name ?? null}
        interfaceScalePercent={appPreferences.interfaceScalePercent}
        transfers={fileTransfers}
        onPageOpen={onPageOpen}
      />

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
          collapsedSize={0}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleSidebarResize}
        >
          <ConnectionSidebar
            ref={connectionSidebarRef}
            isCollapsed={isSidebarCollapsed}
            activeConnectionId={
              activeView === "workspace"
                ? (sshSessions.activeTab?.profile.id ?? null)
                : null
            }
            onConnect={(connection) => {
              sshSessions.openSession(connection);
              onViewChange("workspace");
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="workspace" minSize={560}>
          <main className="flex h-full min-w-0 flex-col bg-workspace">
            <SessionTabs
              tabs={sshSessions.tabs}
              activeTabId={activeView === "workspace" ? sshSessions.activeTabId : null}
              pageTabs={pageTabs}
              activePageId={activeView === "workspace" ? null : activeView}
              isSidebarCollapsed={isSidebarCollapsed}
              isFilePanelOpen={isFilePanelOpen}
              isFilePanelEnabled={activeView === "workspace"}
              onSelect={(localId) => {
                sshSessions.selectSession(localId);
                onViewChange("workspace");
              }}
              onClose={closeSession}
              onReconnect={reconnectSession}
              onCloseOther={closeOtherSessions}
              onCloseRight={closeSessionsToRight}
              onPageSelect={onViewChange}
              onPageClose={onPageClose}
              onSidebarToggle={handleSidebarToggle}
              onNewConnection={openNewConnection}
              onFilePanelToggle={() => onFilePanelOpenChange(!isFilePanelOpen)}
            />

            <div className="relative min-h-0 flex-1">
              <div
                aria-hidden={activeView !== "workspace"}
                inert={activeView !== "workspace"}
                className={cn(
                  "absolute inset-0 min-w-0",
                  activeView === "workspace"
                    ? "visible"
                    : "invisible pointer-events-none",
                )}
              >
                <div className="h-full min-h-0">
                  <ResizablePanelGroup
                    orientation="horizontal"
                    defaultLayout={fileLayout.defaultLayout}
                    onLayoutChanged={fileLayout.onLayoutChanged}
                  >
                    <ResizablePanel id="terminal" minSize={560}>
                      <TerminalWorkspace
                        tabs={sshSessions.tabs}
                        activeTabId={sshSessions.activeTabId}
                        isWorkspaceVisible={activeView === "workspace"}
                        themeProfileId={terminalThemeProfileId}
                        isSemanticHighlightingEnabled={
                          appPreferences.terminalSemanticHighlightingEnabled
                        }
                        fontFamily={terminalFonts.activeFontFamily}
                        fontWeight={appPreferences.terminalFontWeight}
                        fontWeightBold={getTerminalBoldFontWeight(
                          appPreferences.terminalFontWeight,
                        )}
                        fontSize={appPreferences.terminalFontSize}
                        lineHeight={appPreferences.terminalLineHeight}
                        isFontSizeShortcutsEnabled={
                          appPreferences.terminalFontSizeShortcutsEnabled
                        }
                        onFontSizeChange={updateTerminalFontSize}
                        onNewConnection={openNewConnection}
                        onImportSshConfig={openSshConfigImport}
                        onStart={sshSessions.startSession}
                        onRegisterOutput={sshSessions.registerOutputHandler}
                        onInput={sshSessions.writeInput}
                        onResize={sshSessions.resizeSession}
                        onReconnect={reconnectSession}
                        onClose={closeSession}
                      />
                    </ResizablePanel>
                    <ResizableHandle
                      className={cn(!(isWideWorkspace && isFilePanelOpen) && "hidden")}
                    />
                    <ResizablePanel
                      id="files"
                      panelRef={filePanelRef}
                      defaultSize={360}
                      minSize={340}
                      maxSize={600}
                      collapsedSize={0}
                      collapsible
                      groupResizeBehavior="preserve-pixel-size"
                    >
                      <div
                        className="h-full"
                        aria-hidden={!(isWideWorkspace && isFilePanelOpen)}
                        inert={!(isWideWorkspace && isFilePanelOpen)}
                      >
                        <FilePanel
                          session={activeSession}
                          browser={remoteFiles}
                          isSelectingUpload={fileTransfers.isSelectingFiles}
                          isSelectingDownload={fileTransfers.isSelectingDownload}
                          onUpload={uploadFiles}
                          onUploadFolder={uploadFolder}
                          onDownload={downloadFile}
                          onDownloadFolder={downloadFolder}
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </div>
              </div>

              {activeView === "settings" ? (
                <div
                  id={WORKSPACE_PAGE_DEFINITIONS.settings.controlsId}
                  role="tabpanel"
                  aria-label="设置"
                  className="absolute inset-0 min-w-0 bg-workspace"
                >
                  <SettingsWorkspace
                    appPreferences={appPreferences}
                    isAppPreferencesLoading={isAppPreferencesLoading}
                    appPreferencesError={appPreferencesError}
                    interfaceScaleError={interfaceScaleError}
                    onAppPreferencesChange={onAppPreferencesChange}
                    terminalThemeProfileId={terminalThemeProfileId}
                    terminalFonts={terminalFonts}
                    onConnectionsImported={() =>
                      void connectionSidebarRef.current?.refreshConnections()
                    }
                  />
                </div>
              ) : null}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar activeTab={sshSessions.activeTab} />

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
            session={activeSession}
            browser={remoteFiles}
            isSelectingUpload={fileTransfers.isSelectingFiles}
            isSelectingDownload={fileTransfers.isSelectingDownload}
            onUpload={uploadFiles}
            onUploadFolder={uploadFolder}
            onDownload={downloadFile}
            onDownloadFolder={downloadFolder}
            className="h-full border-l-0"
            onClose={() => onFilePanelOpenChange(false)}
          />
        </SheetContent>
      </Sheet>

      <HostKeyVerificationDialog
        key={sshSessions.hostKeyTab?.localId ?? "host-key"}
        tab={sshSessions.hostKeyTab}
        onDecision={sshSessions.decideHostKey}
      />
    </div>
  );
}
