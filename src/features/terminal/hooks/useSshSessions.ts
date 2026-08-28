import { useCallback, useRef, useState } from "react";

import { getCommandError } from "@/lib/tauri/errors";
import {
  closeSshSession,
  decideSshHostKey,
  resizeSshSession,
  sendSshInput,
  startSshSession,
} from "@/lib/tauri/sessions";
import type { ConnectionProfile } from "@/types/connections";
import type { HostKeyDecision } from "@/types/sessions";

import type {
  SessionOutputHandler,
  SshSessionTab,
  TerminalDimensions,
} from "../sessionTypes";

type TabUpdater = (current: SshSessionTab[]) => SshSessionTab[];

export function useSshSessions() {
  const [tabs, setTabs] = useState<SshSessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  const attemptedIdsRef = useRef(new Set<string>());
  const startingIdsRef = useRef(new Set<string>());
  const closingIdsRef = useRef(new Set<string>());
  const closingBackendIdsRef = useRef(new Set<string>());
  const outputHandlersRef = useRef(new Map<string, SessionOutputHandler>());

  const updateTabs = useCallback((updater: TabUpdater) => {
    setTabs((current) => {
      const next = updater(current);
      tabsRef.current = next;
      return next;
    });
  }, []);

  const updateTab = useCallback(
    (localId: string, updater: (tab: SshSessionTab) => SshSessionTab) => {
      updateTabs((current) =>
        current.map((tab) => (tab.localId === localId ? updater(tab) : tab)),
      );
    },
    [updateTabs],
  );

  const requestBackendClose = useCallback((sessionId: string) => {
    if (closingBackendIdsRef.current.has(sessionId)) {
      return;
    }

    closingBackendIdsRef.current.add(sessionId);
    void closeSshSession(sessionId)
      .catch(() => undefined)
      .finally(() => closingBackendIdsRef.current.delete(sessionId));
  }, []);

  const openSession = useCallback(
    (profile: ConnectionProfile) => {
      const existingTab = tabsRef.current.find(
        (tab) =>
          tab.profile.id === profile.id &&
          !tab.startError &&
          (!tab.snapshot ||
            !["closed", "disconnected", "error"].includes(tab.snapshot.state)),
      );

      if (existingTab) {
        setActiveTabId(existingTab.localId);
        return existingTab.localId;
      }

      const localId = crypto.randomUUID();
      const nextTab: SshSessionTab = {
        localId,
        profile,
        snapshot: null,
        startError: null,
        isStarting: false,
      };

      updateTabs((current) => [...current, nextTab]);
      setActiveTabId(localId);
      return localId;
    },
    [updateTabs],
  );

  const registerOutputHandler = useCallback(
    (localId: string, handler: SessionOutputHandler) => {
      outputHandlersRef.current.set(localId, handler);

      return () => {
        if (outputHandlersRef.current.get(localId) === handler) {
          outputHandlersRef.current.delete(localId);
        }
      };
    },
    [],
  );

  const startSession = useCallback(
    async (localId: string, dimensions: TerminalDimensions) => {
      const tab = tabsRef.current.find((candidate) => candidate.localId === localId);

      if (
        !tab ||
        attemptedIdsRef.current.has(localId) ||
        startingIdsRef.current.has(localId) ||
        closingIdsRef.current.has(localId)
      ) {
        return;
      }

      attemptedIdsRef.current.add(localId);
      startingIdsRef.current.add(localId);
      updateTab(localId, (current) => ({
        ...current,
        startError: null,
        isStarting: true,
      }));

      try {
        const snapshot = await startSshSession(
          {
            connectionId: tab.profile.id,
            ...dimensions,
          },
          {
            onState: (nextSnapshot) => {
              if (closingIdsRef.current.has(localId)) {
                requestBackendClose(nextSnapshot.id);
                return;
              }

              updateTab(localId, (current) => ({
                ...current,
                snapshot: nextSnapshot,
                isStarting: false,
              }));
            },
            onOutput: (data) => outputHandlersRef.current.get(localId)?.(data),
          },
        );

        if (closingIdsRef.current.has(localId)) {
          requestBackendClose(snapshot.id);
          return;
        }

        updateTab(localId, (current) => ({
          ...current,
          snapshot,
          isStarting: false,
        }));
      } catch (error) {
        if (!closingIdsRef.current.has(localId)) {
          updateTab(localId, (current) => ({
            ...current,
            startError: getCommandError(error),
            isStarting: false,
          }));
        }
      } finally {
        startingIdsRef.current.delete(localId);
        closingIdsRef.current.delete(localId);
      }
    },
    [requestBackendClose, updateTab],
  );

  const selectSession = useCallback((localId: string) => {
    setActiveTabId(localId);
  }, []);

  const closeSession = useCallback(
    (localId: string) => {
      const currentTabs = tabsRef.current;
      const closingIndex = currentTabs.findIndex((tab) => tab.localId === localId);
      if (closingIndex === -1) {
        return;
      }

      const closingTab = currentTabs[closingIndex];
      const nextTabs = currentTabs.filter((tab) => tab.localId !== localId);
      closingIdsRef.current.add(localId);
      attemptedIdsRef.current.delete(localId);
      outputHandlersRef.current.delete(localId);
      updateTabs(() => nextTabs);
      setActiveTabId((currentActiveId) => {
        if (currentActiveId !== localId) {
          return currentActiveId;
        }

        return nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.localId ?? null;
      });

      if (closingTab.snapshot) {
        requestBackendClose(closingTab.snapshot.id);
        closingIdsRef.current.delete(localId);
      } else if (!startingIdsRef.current.has(localId)) {
        closingIdsRef.current.delete(localId);
      }
    },
    [requestBackendClose, updateTabs],
  );

  const decideHostKey = useCallback(
    async (localId: string, decision: HostKeyDecision) => {
      const snapshot = tabsRef.current.find((tab) => tab.localId === localId)?.snapshot;
      if (!snapshot || snapshot.state !== "verifyingHost") {
        return;
      }

      await decideSshHostKey(snapshot.id, decision);
    },
    [],
  );

  const writeInput = useCallback(async (localId: string, data: Uint8Array) => {
    const snapshot = tabsRef.current.find((tab) => tab.localId === localId)?.snapshot;
    if (!snapshot || snapshot.state !== "connected") {
      return;
    }

    await sendSshInput(snapshot.id, data);
  }, []);

  const resizeSession = useCallback(
    async (localId: string, dimensions: TerminalDimensions) => {
      const snapshot = tabsRef.current.find((tab) => tab.localId === localId)?.snapshot;
      if (!snapshot || snapshot.state !== "connected") {
        return;
      }

      await resizeSshSession(snapshot.id, dimensions);
    },
    [],
  );

  const activeTab = tabs.find((candidate) => candidate.localId === activeTabId) ?? null;
  const hostKeyTab =
    tabs.find(
      (tab) => tab.localId === activeTabId && tab.snapshot?.state === "verifyingHost",
    ) ??
    tabs.find((tab) => tab.snapshot?.state === "verifyingHost") ??
    null;

  return {
    tabs,
    activeTab,
    activeTabId,
    hostKeyTab,
    openSession,
    selectSession,
    closeSession,
    startSession,
    registerOutputHandler,
    decideHostKey,
    writeInput,
    resizeSession,
  };
}

export type SshSessionsController = ReturnType<typeof useSshSessions>;
