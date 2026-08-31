import type {
  IBuffer,
  IDecoration,
  IDisposable,
  IMarker,
  Terminal,
} from "@xterm/xterm";

import { findTerminalSemanticMatches } from "./terminalSemanticRules";
import type {
  TerminalSemanticPalette,
  TerminalSemanticTokenKind,
} from "./terminalThemeProfiles";

const VIEWPORT_OVERSCAN_ROWS = 2;

type LogicalCell = {
  start: number;
  end: number;
  row: number;
  column: number;
  width: number;
  isDefault: boolean;
};

type DesiredDecoration = {
  row: number;
  column: number;
  width: number;
  kind: TerminalSemanticTokenKind;
};

type HighlightedRow = {
  marker: IMarker;
  decorations: IDecoration[];
  signature: string;
};

export class TerminalSemanticHighlighter implements IDisposable {
  private readonly subscriptions: IDisposable[];
  private readonly highlightedRows = new Set<HighlightedRow>();
  private animationFrame: number | null = null;
  private isDisposed = false;

  constructor(
    private readonly terminal: Terminal,
    private palette: TerminalSemanticPalette,
    private isEnabled: boolean,
  ) {
    this.subscriptions = [
      terminal.onWriteParsed(() => this.scheduleRefresh()),
      terminal.onScroll(() => this.scheduleRefresh()),
      terminal.onResize(() => this.scheduleRefresh()),
      terminal.buffer.onBufferChange(() => {
        if (terminal.buffer.active.type === "alternate") {
          this.clearHighlights();
        } else {
          this.scheduleRefresh();
        }
      }),
    ];
    this.scheduleRefresh();
  }

  setEnabled(isEnabled: boolean) {
    if (this.isEnabled === isEnabled) {
      return;
    }
    this.isEnabled = isEnabled;
    if (isEnabled) {
      this.scheduleRefresh();
    } else {
      this.clearHighlights();
    }
  }

  setPalette(palette: TerminalSemanticPalette) {
    this.palette = palette;
    this.clearHighlights();
    this.scheduleRefresh();
  }

  refresh() {
    this.scheduleRefresh();
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.clearHighlights();
  }

  private scheduleRefresh() {
    if (this.isDisposed || !this.isEnabled || this.animationFrame !== null) {
      return;
    }
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      this.refreshVisibleBuffer();
    });
  }

  private refreshVisibleBuffer() {
    const buffer = this.terminal.buffer.active;
    if (!this.isEnabled || buffer.type !== "normal") {
      this.clearHighlights();
      return;
    }

    const { desiredByRow, scanStart, scanEnd } = this.collectDesiredDecorations(buffer);
    const existingByRow = new Map<number, HighlightedRow>();

    for (const highlighted of [...this.highlightedRows]) {
      if (highlighted.marker.isDisposed) {
        this.highlightedRows.delete(highlighted);
        continue;
      }
      const row = highlighted.marker.line;
      const duplicate = existingByRow.get(row);
      if (duplicate) {
        this.disposeHighlightedRow(highlighted);
      } else {
        existingByRow.set(row, highlighted);
      }
    }

    for (const [row, highlighted] of existingByRow) {
      if (row < scanStart || row >= scanEnd || !desiredByRow.has(row)) {
        this.disposeHighlightedRow(highlighted);
        existingByRow.delete(row);
      }
    }

    for (const [row, desired] of desiredByRow) {
      const signature = desired
        .map(
          (item) =>
            `${item.column}:${item.width}:${item.kind}:${this.palette[item.kind]}`,
        )
        .join("|");
      const existing = existingByRow.get(row);
      if (existing?.signature === signature) {
        continue;
      }
      if (existing) {
        this.disposeHighlightedRow(existing);
      }
      this.createHighlightedRow(buffer, row, desired, signature);
    }
  }

  private collectDesiredDecorations(buffer: IBuffer) {
    let scanStart = Math.max(0, buffer.viewportY - VIEWPORT_OVERSCAN_ROWS);
    while (scanStart > 0 && buffer.getLine(scanStart)?.isWrapped) {
      scanStart -= 1;
    }

    let scanEnd = Math.min(
      buffer.length,
      buffer.viewportY + this.terminal.rows + VIEWPORT_OVERSCAN_ROWS,
    );
    while (scanEnd < buffer.length && buffer.getLine(scanEnd)?.isWrapped) {
      scanEnd += 1;
    }

    const desiredByRow = new Map<number, DesiredDecoration[]>();
    let row = scanStart;
    while (row < scanEnd) {
      const groupStart = row;
      row += 1;
      while (row < scanEnd && buffer.getLine(row)?.isWrapped) {
        row += 1;
      }
      const desired = this.highlightLogicalLine(buffer, groupStart, row);
      for (const item of desired) {
        const current = desiredByRow.get(item.row) ?? [];
        current.push(item);
        desiredByRow.set(item.row, current);
      }
    }

    for (const desired of desiredByRow.values()) {
      desired.sort(
        (left, right) => left.column - right.column || left.width - right.width,
      );
    }

    return { desiredByRow, scanStart, scanEnd };
  }

  private highlightLogicalLine(buffer: IBuffer, startRow: number, endRow: number) {
    const cells: LogicalCell[] = [];
    let text = "";
    const reusableCell = buffer.getNullCell();

    for (let row = startRow; row < endRow; row += 1) {
      const line = buffer.getLine(row);
      if (!line) {
        continue;
      }
      const columns = Math.min(line.length, this.terminal.cols);
      for (let column = 0; column < columns; column += 1) {
        const cell = line.getCell(column, reusableCell);
        if (!cell || cell.getWidth() === 0) {
          continue;
        }
        const value = cell.getChars() || " ";
        const start = text.length;
        text += value;
        cells.push({
          start,
          end: text.length,
          row,
          column,
          width: cell.getWidth(),
          isDefault: cell.isAttributeDefault(),
        });
      }
    }

    text = text.trimEnd();
    if (!text) {
      return [];
    }

    const desired: DesiredDecoration[] = [];
    for (const match of findTerminalSemanticMatches(text)) {
      const matchedCells = cells.filter(
        (cell) => cell.start < match.end && cell.end > match.start,
      );
      if (matchedCells.length === 0 || matchedCells.some((cell) => !cell.isDefault)) {
        continue;
      }

      let current: DesiredDecoration | null = null;
      for (const cell of matchedCells) {
        if (
          current &&
          current.row === cell.row &&
          current.column + current.width === cell.column
        ) {
          current.width += cell.width;
          continue;
        }
        current = {
          row: cell.row,
          column: cell.column,
          width: cell.width,
          kind: match.kind,
        };
        desired.push(current);
      }
    }

    return desired;
  }

  private createHighlightedRow(
    buffer: IBuffer,
    row: number,
    desired: DesiredDecoration[],
    signature: string,
  ) {
    const cursorLine = buffer.baseY + buffer.cursorY;
    const marker = this.terminal.registerMarker(row - cursorLine);
    if (!marker || marker.isDisposed) {
      return;
    }

    const decorations = desired.flatMap((item) => {
      const decoration = this.terminal.registerDecoration({
        marker,
        x: item.column,
        width: item.width,
        foregroundColor: this.palette[item.kind],
        layer: "bottom",
      });
      return decoration ? [decoration] : [];
    });
    if (decorations.length === 0) {
      marker.dispose();
      return;
    }

    this.highlightedRows.add({ marker, decorations, signature });
  }

  private clearHighlights() {
    for (const highlighted of [...this.highlightedRows]) {
      this.disposeHighlightedRow(highlighted);
    }
  }

  private disposeHighlightedRow(highlighted: HighlightedRow) {
    for (const decoration of highlighted.decorations) {
      decoration.dispose();
    }
    highlighted.marker.dispose();
    this.highlightedRows.delete(highlighted);
  }
}
