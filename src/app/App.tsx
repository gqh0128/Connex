import { useCallback, useState } from "react";

import { ExitConfirmationDialog } from "@/app/ExitConfirmationDialog";
import { useAppPreferences } from "@/app/useAppPreferences";
import { useExitConfirmation } from "@/app/useExitConfirmation";
import { AppShell } from "@/components/layout/AppShell";
import { useSshSessions } from "@/features/terminal/hooks/useSshSessions";
import { useTerminalFonts } from "@/features/terminal/hooks/useTerminalFonts";
import { DEFAULT_TERMINAL_THEME_PROFILE_ID } from "@/features/terminal/terminalThemeProfiles";
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
  const appPreferences = useAppPreferences();
  const terminalFonts = useTerminalFonts(appPreferences.preferences.terminalFontId);
  const exitConfirmation = useExitConfirmation({
    confirmBeforeExit: appPreferences.preferences.confirmBeforeExit,
    onConfirmBeforeExitChange: async (confirmBeforeExit) => {
      await appPreferences.update({ confirmBeforeExit });
    },
  });

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
        appPreferences={appPreferences.preferences}
        isAppPreferencesLoading={appPreferences.isLoading}
        appPreferencesError={appPreferences.error?.message ?? null}
        onAppPreferencesChange={appPreferences.update}
        terminalThemeProfileId={DEFAULT_TERMINAL_THEME_PROFILE_ID}
        terminalFonts={terminalFonts}
        sshSessions={sshSessions}
      />
      <ExitConfirmationDialog controller={exitConfirmation} />
    </>
  );
}
