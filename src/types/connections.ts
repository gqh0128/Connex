export type AuthenticationMethod = "password" | "privateKey" | "agent";

export type SaveConnectionInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  authenticationMethod: AuthenticationMethod;
  privateKeyPath: string | null;
};

export type ConnectionProfile = SaveConnectionInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
};
