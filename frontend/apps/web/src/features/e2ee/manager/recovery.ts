const recoveryDisabledError = (): Error =>
  new Error("Rust E2EE recovery backup is not implemented; old P-256 recovery data is not compatible.");

export async function createRecoveryBackup(): Promise<void> {
  throw recoveryDisabledError();
}

export async function recoverWithPassword(): Promise<void> {
  throw recoveryDisabledError();
}
