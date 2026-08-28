export type SessionState =
  | "connecting"
  | "verifyingHost"
  | "authenticating"
  | "connected"
  | "closing"
  | "closed"
  | "disconnected"
  | "error";

export type SessionFailureCode =
  | "networkUnavailable"
  | "hostVerificationFailed"
  | "hostKeyChanged"
  | "authenticationFailed"
  | "agentUnavailable"
  | "privateKeyUnavailable"
  | "shellUnavailable"
  | "connectionLost"
  | "internal";

export type HostKeyChallenge = {
  keyAlgorithm: string;
  fingerprintSha256: string;
};

export type SessionFailure = {
  code: SessionFailureCode;
  message: string;
};

export type SessionSnapshot = {
  id: string;
  connectionId: string;
  connectionName: string;
  host: string;
  port: number;
  username: string;
  state: SessionState;
  hostKeyChallenge: HostKeyChallenge | null;
  failure: SessionFailure | null;
  exitStatus: number | null;
};

export type StartSshSessionInput = {
  connectionId: string;
  columns: number;
  rows: number;
  pixelWidth: number;
  pixelHeight: number;
};

export type ResizeSshSessionInput = Pick<
  StartSshSessionInput,
  "columns" | "rows" | "pixelWidth" | "pixelHeight"
>;

export type HostKeyDecision = "acceptOnce" | "acceptAndRemember" | "reject";

export type SshSessionHandlers = {
  onState: (snapshot: SessionSnapshot) => void;
  onOutput: (data: Uint8Array) => void;
};
