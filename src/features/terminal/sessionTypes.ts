import type { ConnectionProfile } from "@/types/connections";
import type { CommandError } from "@/types/ipc";
import type { SessionSnapshot, StartSshSessionInput } from "@/types/sessions";

export type TerminalDimensions = Pick<
  StartSshSessionInput,
  "columns" | "rows" | "pixelWidth" | "pixelHeight"
>;

export type SshSessionTab = {
  localId: string;
  profile: ConnectionProfile;
  snapshot: SessionSnapshot | null;
  startError: CommandError | null;
  isStarting: boolean;
};

export type SessionOutputHandler = (data: Uint8Array) => void;
