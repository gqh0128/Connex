import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";

export function App() {
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(true);

  return (
    <AppShell
      isFilePanelOpen={isFilePanelOpen}
      onFilePanelToggle={() => setIsFilePanelOpen((isOpen) => !isOpen)}
    />
  );
}
