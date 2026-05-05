import type { E2eeSessionStatus } from "./types";

type Listener = (sessionId: string, status: E2eeSessionStatus) => void;

const listeners = new Set<Listener>();

export function onE2eeStatusChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitE2eeStatusChange(
  sessionId: string,
  status: E2eeSessionStatus,
) {
  for (const fn of listeners) fn(sessionId, status);
}
