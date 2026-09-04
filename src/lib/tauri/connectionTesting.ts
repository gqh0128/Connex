import { invoke } from "@tauri-apps/api/core";

import type {
  SshConnectionTestResult,
  TestSshConnectionInput,
} from "@/types/connections";

const TEST_SSH_CONNECTION_COMMAND = "test_ssh_connection";

export function testSshConnection(input: TestSshConnectionInput) {
  return invoke<SshConnectionTestResult>(TEST_SSH_CONNECTION_COMMAND, { input });
}
