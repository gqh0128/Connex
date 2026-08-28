import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  HostKeyDecision,
  ResizeSshSessionInput,
  SessionSnapshot,
  SshSessionHandlers,
  StartSshSessionInput,
} from "@/types/sessions";

const START_SSH_SESSION_COMMAND = "start_ssh_session";
const GET_SSH_SESSION_COMMAND = "get_ssh_session";
const DECIDE_SSH_HOST_KEY_COMMAND = "decide_ssh_host_key";
const SEND_SSH_INPUT_COMMAND = "send_ssh_input";
const RESIZE_SSH_SESSION_COMMAND = "resize_ssh_session";
const KEEPALIVE_SSH_SESSION_COMMAND = "keepalive_ssh_session";
const CLOSE_SSH_SESSION_COMMAND = "close_ssh_session";

export function startSshSession(
  input: StartSshSessionInput,
  handlers: SshSessionHandlers,
) {
  const onState = new Channel<SessionSnapshot>(handlers.onState);
  const onOutput = new Channel<ArrayBuffer>((data) => {
    handlers.onOutput(new Uint8Array(data));
  });

  return invoke<SessionSnapshot>(START_SSH_SESSION_COMMAND, {
    input,
    onState,
    onOutput,
  });
}

export function getSshSession(sessionId: string) {
  return invoke<SessionSnapshot>(GET_SSH_SESSION_COMMAND, { sessionId });
}

export function decideSshHostKey(sessionId: string, decision: HostKeyDecision) {
  return invoke<void>(DECIDE_SSH_HOST_KEY_COMMAND, { sessionId, decision });
}

export function sendSshInput(sessionId: string, data: Uint8Array) {
  return invoke<void>(SEND_SSH_INPUT_COMMAND, {
    sessionId,
    data: Array.from(data),
  });
}

export function resizeSshSession(sessionId: string, input: ResizeSshSessionInput) {
  return invoke<void>(RESIZE_SSH_SESSION_COMMAND, { sessionId, input });
}

export function keepaliveSshSession(sessionId: string) {
  return invoke<void>(KEEPALIVE_SSH_SESSION_COMMAND, { sessionId });
}

export function closeSshSession(sessionId: string) {
  return invoke<void>(CLOSE_SSH_SESSION_COMMAND, { sessionId });
}
