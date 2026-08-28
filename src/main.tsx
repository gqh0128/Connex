import React from "react";
import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import { App } from "@/app/App";
import { ThemeProvider } from "@/app/ThemeProvider";
import { initializeTheme } from "@/app/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/styles/globals.css";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={350}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
