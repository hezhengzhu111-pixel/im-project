import type { E2eeSessionStatus } from '@im/shared-e2ee-core';

type StatusListener = (sessionId: string, status: E2eeSessionStatus) => void;
type PendingRequestListener = (sessionId: string) => void;

const statusListeners = new Set<StatusListener>();
const pendingRequestListeners = new Set<PendingRequestListener>();

export const emitE2eeStatusChange = (sessionId: string, status: E2eeSessionStatus): void => {
  statusListeners.forEach((listener) => listener(sessionId, status));
};

export const subscribeE2eeStatusChanges = (listener: StatusListener): (() => void) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

export const emitPendingE2eeRequest = (sessionId: string): void => {
  pendingRequestListeners.forEach((listener) => listener(sessionId));
};

export const subscribePendingE2eeRequests = (listener: PendingRequestListener): (() => void) => {
  pendingRequestListeners.add(listener);
  return () => pendingRequestListeners.delete(listener);
};

