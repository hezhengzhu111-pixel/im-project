import { useAuthStore } from '@/stores/authStore';
import { ensureLocalE2eeDeviceRegistered } from './localDevice';

interface E2eeReadinessEntry {
  userId: string;
  sessionGeneration: number;
  promise: Promise<void>;
}

let readinessInFlight: E2eeReadinessEntry | null = null;

const currentSessionContext = (): { userId: string; sessionGeneration: number } => {
  const authState = useAuthStore.getState();
  const userId = authState.currentUser?.id || '';
  if (!userId) {
    throw new Error('Current user unavailable for E2EE readiness');
  }
  return {
    userId,
    sessionGeneration: authState.sessionGeneration,
  };
};

const sameReadinessContext = (
  entry: E2eeReadinessEntry,
  context: { userId: string; sessionGeneration: number },
): boolean =>
  entry.userId === context.userId &&
  entry.sessionGeneration === context.sessionGeneration;

export const ensureE2eeReadyForCurrentUser = (): Promise<void> => {
  let context: { userId: string; sessionGeneration: number };
  try {
    context = currentSessionContext();
  } catch (error) {
    return Promise.reject(error);
  }
  if (readinessInFlight && sameReadinessContext(readinessInFlight, context)) {
    return readinessInFlight.promise;
  }

  const promise = ensureLocalE2eeDeviceRegistered().then(() => undefined);
  const entry: E2eeReadinessEntry = { ...context, promise };
  readinessInFlight = entry;
  void promise.catch(() => {
    if (readinessInFlight === entry) {
      readinessInFlight = null;
    }
  });
  return promise;
};

export const __resetE2eeReadinessForTests = (): void => {
  readinessInFlight = null;
};
