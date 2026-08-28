import { useCallback, useEffect, useState } from "react";

import { createConnection, listConnections } from "@/lib/tauri/connections";
import { getCommandError } from "@/lib/tauri/errors";
import type { ConnectionProfile, SaveConnectionInput } from "@/types/connections";
import type { CommandError } from "@/types/ipc";

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<CommandError | null>(null);

  const refreshConnections = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      setConnections(await listConnections());
    } catch (error) {
      setLoadError(getCommandError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    void listConnections()
      .then((profiles) => {
        if (isActive) {
          setConnections(profiles);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(getCommandError(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const create = useCallback(async (input: SaveConnectionInput) => {
    const created = await createConnection(input);
    setConnections((current) => [created, ...current]);
    return created;
  }, []);

  return {
    connections,
    isLoading,
    loadError,
    create,
    refreshConnections,
  };
}
