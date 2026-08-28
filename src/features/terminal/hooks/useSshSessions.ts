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

  const retireTabs = useCallback(
    (closingTabs: SshSessionTab[]) => {
      for (const closingTab of closingTabs) {
        closingIdsRef.current.add(closingTab.localId);
        attemptedIdsRef.current.delete(closingTab.localId);
        outputHandlersRef.current.delete(closingTab.localId);

        if (closingTab.snapshot) {
          requestBackendClose(closingTab.snapshot.id);
          closingIdsRef.current.delete(closingTab.localId);
        } else if (!startingIdsRef.current.has(closingTab.localId)) {
          closingIdsRef.current.delete(closingTab.localId);
        }
      }
    },
    [requestBackendClose],
  );

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

  const closeSessions = useCallback(
    (localIds: string[]) => {
      const currentTabs = tabsRef.current;
      const closingIds = new Set(localIds);
      const closingIndex = currentTabs.findIndex((tab) => closingIds.has(tab.localId));
      if (closingIndex === -1) {
        return;
      }

      const closingTabs = currentTabs.filter((tab) => closingIds.has(tab.localId));
      const nextTabs = currentTabs.filter((tab) => !closingIds.has(tab.localId));
      retireTabs(closingTabs);
      updateTabs(() => nextTabs);
      setActiveTabId((currentActiveId) => {
        if (!currentActiveId || !closingIds.has(currentActiveId)) {
          return currentActiveId;
        }

        return nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.localId ?? null;
      });
    },
    [retireTabs, updateTabs],
  );

  const closeSession = useCallback(
    (localId: string) => {
      closeSessions([localId]);
    },
    [closeSessions],
  );

  const closeOtherSessions = useCallback(
    (localId: string) => {
      closeSessions(
        tabsRef.current
          .filter((tab) => tab.localId !== localId)
          .map((tab) => tab.localId),
      );
    },
    [closeSessions],
  );

  const closeSessionsToRight = useCallback(
    (localId: string) => {
      const currentTabs = tabsRef.current;
      const tabIndex = currentTabs.findIndex((tab) => tab.localId === localId);
      if (tabIndex >= 0) {
        closeSessions(currentTabs.slice(tabIndex + 1).map((tab) => tab.localId));
      }
    },
    [closeSessions],
  );

  const reconnectSession = useCallback(
    (localId: string) => {
      const currentTabs = tabsRef.current;
      const tabIndex = currentTabs.findIndex((tab) => tab.localId === localId);
      const reconnectingTab = currentTabs[tabIndex];
      if (!reconnectingTab) {
        return;
      }

      const nextLocalId = crypto.randomUUID();
      const nextTab: SshSessionTab = {
        localId: nextLocalId,
        profile: reconnectingTab.profile,
        snapshot: null,
        startError: null,
        isStarting: false,
      };
      const nextTabs = [...currentTabs];
      nextTabs[tabIndex] = nextTab;
      retireTabs([reconnectingTab]);
      updateTabs(() => nextTabs);
      setActiveTabId((currentActiveId) =>
        currentActiveId === localId ? nextLocalId : currentActiveId,
      );
    },
    [retireTabs, updateTabs],
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
    closeOtherSessions,
    closeSessionsToRight,
    reconnectSession,
    startSession,
    registerOutputHandler,
    decideHostKey,
    writeInput,
    resizeSession,
  };
}

export type SshSessionsController = ReturnType<typeof useSshSessions>;
