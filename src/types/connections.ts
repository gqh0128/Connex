import type { HostKeyChallenge, SessionFailure } from "@/types/sessions";

export type AuthenticationMethod = "password" | "privateKey" | "agent";
export type ConnectionOrigin = "manual" | "sshConfig";

export type ConnectionMetadataInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  authenticationMethod: AuthenticationMethod;
  privateKeyPath: string | null;
};

export type SaveConnectionInput = ConnectionMetadataInput & {
  password: string | null;
  privateKeyPassphrase: string | null;
};

export type TestSshConnectionInput = SaveConnectionInput & {
  connectionId: string | null;
  acceptedHostKey: HostKeyChallenge | null;
  shouldRememberHostKey: boolean;
};

export type SshConnectionTestResult =
  | { status: "success" }
  | {
      status: "hostKeyRequired";
      hostKey: HostKeyChallenge;
    }
  | {
      status: "failed";
      failure: SessionFailure;
    };

export type ConnectionProfile = ConnectionMetadataInput & {
  id: string;
  hasStoredCredential: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
  origin: ConnectionOrigin;
};
