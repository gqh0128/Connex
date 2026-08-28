import { invoke } from "@tauri-apps/api/core";

import type { ConnectionProfile, SaveConnectionInput } from "@/types/connections";

const LIST_CONNECTIONS_COMMAND = "list_connections";
const CREATE_CONNECTION_COMMAND = "create_connection";
const UPDATE_CONNECTION_COMMAND = "update_connection";
const DELETE_CONNECTION_COMMAND = "delete_connection";
const REVEAL_CONNECTION_CREDENTIAL_COMMAND = "reveal_connection_credential";

export function listConnections() {
  return invoke<ConnectionProfile[]>(LIST_CONNECTIONS_COMMAND);
}

export function createConnection(input: SaveConnectionInput) {
  return invoke<ConnectionProfile>(CREATE_CONNECTION_COMMAND, { input });
}

export function updateConnection(id: string, input: SaveConnectionInput) {
  return invoke<ConnectionProfile>(UPDATE_CONNECTION_COMMAND, { id, input });
}

export function deleteConnection(id: string) {
  return invoke<void>(DELETE_CONNECTION_COMMAND, { id });
}

export function revealConnectionCredential(id: string) {
  return invoke<string | null>(REVEAL_CONNECTION_CREDENTIAL_COMMAND, { id });
}
