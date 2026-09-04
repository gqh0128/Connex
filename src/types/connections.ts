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

export type ConnectionProfile = ConnectionMetadataInput & {
  id: string;
  hasStoredCredential: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
  origin: ConnectionOrigin;
};
