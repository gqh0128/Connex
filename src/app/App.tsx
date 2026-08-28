import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { WIDE_WORKSPACE_QUERY } from "@/components/layout/layoutConstants";

export function App() {
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(
    () => window.matchMedia(WIDE_WORKSPACE_QUERY).matches,
  );

  return (
    <AppShell
      isFilePanelOpen={isFilePanelOpen}
      onFilePanelOpenChange={setIsFilePanelOpen}
    />
  );
}
