import { useCallback, useMemo, useState } from "react";

import type { RemoteFileEntry } from "@/types/sftp";

export type RemoteFileSelectionModifiers = {
  isRange: boolean;
  isAdditive: boolean;
};

type RemoteFileSelectionState = {
  selectedPaths: ReadonlySet<string>;
  anchorPath: string | null;
};

export type RemoteFileSelectionController = {
  selectedPaths: ReadonlySet<string>;
  selectedEntries: RemoteFileEntry[];
  select: (path: string, modifiers: RemoteFileSelectionModifiers) => void;
  selectAll: () => void;
  selectForContextMenu: (path: string) => void;
  clear: () => void;
};

const EMPTY_SELECTION: RemoteFileSelectionState = {
  selectedPaths: new Set(),
  anchorPath: null,
};

export function useRemoteFileSelection(
  entries: RemoteFileEntry[],
): RemoteFileSelectionController {
  const orderedPaths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const [selection, setSelection] = useState<RemoteFileSelectionState>(EMPTY_SELECTION);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selection.selectedPaths.has(entry.path)),
    [entries, selection.selectedPaths],
  );

  const select = useCallback(
    (path: string, modifiers: RemoteFileSelectionModifiers) => {
      setSelection((current) =>
        resolveRemoteFileSelection(current, orderedPaths, path, modifiers),
      );
    },
    [orderedPaths],
  );

  const selectAll = useCallback(() => {
    setSelection((current) => ({
      selectedPaths: new Set(orderedPaths),
      anchorPath:
        current.anchorPath && orderedPaths.includes(current.anchorPath)
          ? current.anchorPath
          : (orderedPaths[0] ?? null),
    }));
  }, [orderedPaths]);

  const selectForContextMenu = useCallback((path: string) => {
    setSelection((current) =>
      current.selectedPaths.has(path)
        ? current
        : { selectedPaths: new Set([path]), anchorPath: path },
    );
  }, []);

  const clear = useCallback(() => setSelection(EMPTY_SELECTION), []);

  return {
    selectedPaths: selection.selectedPaths,
    selectedEntries,
    select,
    selectAll,
    selectForContextMenu,
    clear,
  };
}

function resolveRemoteFileSelection(
  current: RemoteFileSelectionState,
  orderedPaths: string[],
  targetPath: string,
  { isRange, isAdditive }: RemoteFileSelectionModifiers,
): RemoteFileSelectionState {
  if (isRange) {
    const targetIndex = orderedPaths.indexOf(targetPath);
    const anchorIndex = current.anchorPath
      ? orderedPaths.indexOf(current.anchorPath)
      : -1;
    const effectiveAnchorIndex = anchorIndex >= 0 ? anchorIndex : targetIndex;
    const firstIndex = Math.min(effectiveAnchorIndex, targetIndex);
    const lastIndex = Math.max(effectiveAnchorIndex, targetIndex);
    const selectedPaths = isAdditive
      ? new Set(current.selectedPaths)
      : new Set<string>();

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const path = orderedPaths[index];
      if (path) {
        selectedPaths.add(path);
      }
    }

    return {
      selectedPaths,
      anchorPath: anchorIndex >= 0 ? current.anchorPath : targetPath,
    };
  }

  if (isAdditive) {
    const selectedPaths = new Set(current.selectedPaths);
    if (selectedPaths.has(targetPath)) {
      selectedPaths.delete(targetPath);
    } else {
      selectedPaths.add(targetPath);
    }
    return { selectedPaths, anchorPath: targetPath };
  }

  return {
    selectedPaths: new Set([targetPath]),
    anchorPath: targetPath,
  };
}
