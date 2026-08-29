import { useCallback, useState } from "react";

import { ExitConfirmationDialog } from "@/app/ExitConfirmationDialog";
import { useExitConfirmation } from "@/app/useExitConfirmation";
import { AppShell } from "@/components/layout/AppShell";
import { useSshSessions } from "@/features/terminal/hooks/useSshSessions";
import {
  WORKSPACE_PAGE_DEFINITIONS,
  type AppView,
  type WorkspacePageId,
} from "@/types/navigation";

export function App() {
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [openPageIds, setOpenPageIds] = useState<WorkspacePageId[]>([]);
  const sshSessions = useSshSessions();
  const exitConfirmation = useExitConfirmation();

  const openPage = useCallback((pageId: WorkspacePageId) => {
    setOpenPageIds((current) =>
      current.includes(pageId) ? current : [...current, pageId],
    );
    setActiveView(pageId);
  }, []);

  const closePage = useCallback((pageId: WorkspacePageId) => {
    setOpenPageIds((current) => current.filter((candidate) => candidate !== pageId));
    setActiveView((current) => (current === pageId ? "workspace" : current));
  }, []);

  return (
    <>
      <AppShell
        isFilePanelOpen={isFilePanelOpen}
        onFilePanelOpenChange={setIsFilePanelOpen}
        activeView={activeView}
        onViewChange={setActiveView}
        pageTabs={openPageIds.map((pageId) => WORKSPACE_PAGE_DEFINITIONS[pageId])}
        onPageOpen={openPage}
        onPageClose={closePage}
        confirmBeforeExit={exitConfirmation.confirmBeforeExit}
        isAppPreferencesLoading={exitConfirmation.isPreferencesLoading}
        appPreferencesError={exitConfirmation.preferenceError?.message ?? null}
        onConfirmBeforeExitChange={exitConfirmation.setConfirmBeforeExit}
        sshSessions={sshSessions}
      />
      <ExitConfirmationDialog controller={exitConfirmation} />
    </>
  );
}
