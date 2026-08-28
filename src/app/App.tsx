import { useCallback, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { WIDE_WORKSPACE_QUERY } from "@/components/layout/layoutConstants";
import { useSshSessions } from "@/features/terminal/hooks/useSshSessions";
import {
  WORKSPACE_PAGE_DEFINITIONS,
  type AppView,
  type WorkspacePageId,
} from "@/types/navigation";

export function App() {
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(
    () => window.matchMedia(WIDE_WORKSPACE_QUERY).matches,
  );
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [openPageIds, setOpenPageIds] = useState<WorkspacePageId[]>([]);
  const sshSessions = useSshSessions();

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
    <AppShell
      isFilePanelOpen={isFilePanelOpen}
      onFilePanelOpenChange={setIsFilePanelOpen}
      activeView={activeView}
      onViewChange={setActiveView}
      pageTabs={openPageIds.map((pageId) => WORKSPACE_PAGE_DEFINITIONS[pageId])}
      onPageOpen={openPage}
      onPageClose={closePage}
      sshSessions={sshSessions}
    />
  );
}
