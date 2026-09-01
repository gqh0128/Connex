import {
  SearchAddon,
  type ISearchOptions,
  type ISearchResultChangeEvent,
} from "@xterm/addon-search";
import type { IDisposable, Terminal } from "@xterm/xterm";

export type TerminalSearchDirection = "next" | "previous";
export type TerminalSearchResult = ISearchResultChangeEvent;
export type TerminalSearchDecorations = NonNullable<ISearchOptions["decorations"]>;

export const EMPTY_TERMINAL_SEARCH_RESULT: TerminalSearchResult = {
  resultIndex: -1,
  resultCount: 0,
};

const SEARCH_HIGHLIGHT_LIMIT = 1_000;

/**
 * Owns the xterm search addon and keeps its API out of the React search UI.
 * One controller belongs to one terminal instance, so each session retains
 * its own query selection and decorations while tabs are hidden.
 */
export class TerminalSearchController implements IDisposable {
  private readonly addon = new SearchAddon({
    highlightLimit: SEARCH_HIGHLIGHT_LIMIT,
  });
  private readonly resultDisposable: IDisposable;
  private decorations: TerminalSearchDecorations;
  private isCaseSensitive = false;
  private query = "";

  constructor(
    terminal: Terminal,
    decorations: TerminalSearchDecorations,
    onResultChange: (result: TerminalSearchResult) => void,
  ) {
    this.decorations = decorations;
    terminal.loadAddon(this.addon);
    this.resultDisposable = this.addon.onDidChangeResults(onResultChange);
  }

  setDecorations(decorations: TerminalSearchDecorations) {
    this.decorations = decorations;
    if (!this.query) {
      return;
    }

    const query = this.query;
    this.addon.clearDecorations();
    this.find(query, "next", true);
  }

  setCaseSensitive(isCaseSensitive: boolean) {
    if (this.isCaseSensitive === isCaseSensitive) {
      return;
    }

    this.isCaseSensitive = isCaseSensitive;
    // SearchAddon caches results by term and options. Clearing its decorations
    // also invalidates that cache so the next search reports a fresh count.
    this.addon.clearDecorations();
  }

  find(query: string, direction: TerminalSearchDirection, isIncremental = false) {
    if (!query) {
      this.clear();
      return false;
    }

    this.query = query;

    const options: ISearchOptions = {
      caseSensitive: this.isCaseSensitive,
      incremental: isIncremental,
      decorations: this.decorations,
    };

    return direction === "previous"
      ? this.addon.findPrevious(query, options)
      : this.addon.findNext(query, options);
  }

  clearActiveDecoration() {
    this.addon.clearActiveDecoration();
  }

  clear() {
    this.query = "";
    this.addon.clearDecorations();
  }

  dispose() {
    this.resultDisposable.dispose();
    this.addon.dispose();
  }
}

export function formatTerminalSearchResult(
  query: string,
  result: TerminalSearchResult,
) {
  if (!query) {
    return "";
  }
  if (result.resultCount === 0) {
    return "无结果";
  }
  if (result.resultIndex < 0) {
    return `${result.resultCount}+`;
  }
  return `${result.resultIndex + 1}/${result.resultCount}`;
}
