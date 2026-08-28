import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { WIDE_WORKSPACE_QUERY } from "@/components/layout/layoutConstants";
import type { AppView } from "@/types/navigation";

export function App() {
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(
    () => window.matchMedia(WIDE_WORKSPACE_QUERY).matches,
  );
  const [activeView, setActiveView] = useState<AppView>("workspace");

  return (
    <AppShell
      isFilePanelOpen={isFilePanelOpen}
      onFilePanelOpenChange={setIsFilePanelOpen}
      activeView={activeView}
      onViewChange={setActiveView}
    />
  );
}
