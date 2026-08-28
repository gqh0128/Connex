import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { ThemeProvider } from "@/app/ThemeProvider";
import { initializeTheme } from "@/app/theme";
import "@/styles/globals.css";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
