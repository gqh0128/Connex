import { WebLinksAddon } from "@xterm/addon-web-links";
import type { IDisposable, ILinkHandler, Terminal } from "@xterm/xterm";

import { openExternalHttpUrl } from "@/lib/tauri/opener";

export function registerTerminalLinks(
  terminal: Terminal,
  host: HTMLElement,
): IDisposable {
  const tooltip = document.createElement("div");
  tooltip.className = "connex-terminal-link-tooltip xterm-hover";
  tooltip.hidden = true;
  host.append(tooltip);

  const hideTooltip = () => {
    tooltip.hidden = true;
    tooltip.textContent = "";
  };
  const showTooltip = (uri: string, status?: string) => {
    tooltip.textContent = status
      ? `${uri}\n${status}`
      : `${uri}\n${isMacPlatform() ? "⌘" : "Ctrl"} + 点击打开`;
    tooltip.hidden = false;
  };
  const activate = (event: MouseEvent, uri: string) => {
    if (!hasRequiredModifier(event) || terminal.hasSelection()) {
      return;
    }
    void openExternalHttpUrl(uri).catch(() => {
      showTooltip(uri, "无法打开此链接");
    });
  };

  const linkHandler: ILinkHandler = {
    activate,
    hover: (_event, uri) => showTooltip(uri),
    leave: hideTooltip,
    allowNonHttpProtocols: false,
  };
  const previousLinkHandler = terminal.options.linkHandler;
  terminal.options.linkHandler = linkHandler;

  const webLinksAddon = new WebLinksAddon(activate, {
    hover: (_event, uri) => showTooltip(uri),
    leave: hideTooltip,
  });
  terminal.loadAddon(webLinksAddon);

  return {
    dispose() {
      webLinksAddon.dispose();
      hideTooltip();
      tooltip.remove();
      if (terminal.options.linkHandler === linkHandler) {
        terminal.options.linkHandler = previousLinkHandler;
      }
    },
  };
}

function hasRequiredModifier(event: MouseEvent) {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

function isMacPlatform() {
  return /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
}
