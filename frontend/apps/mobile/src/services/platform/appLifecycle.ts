import { AppState, AppStateStatus } from 'react-native';
import { logger } from '@/utils/logger';

type Listener = () => void;

const foregroundListeners = new Set<Listener>();
const backgroundListeners = new Set<Listener>();
let currentState: AppStateStatus = AppState.currentState;
let bound = false;

export const appLifecycle = {
  onForeground(listener: Listener): () => void {
    foregroundListeners.add(listener);
    return () => foregroundListeners.delete(listener);
  },

  onBackground(listener: Listener): () => void {
    backgroundListeners.add(listener);
    return () => backgroundListeners.delete(listener);
  },

  isForeground(): boolean {
    return currentState === 'active';
  },
};

export const bindLifecycleHandlers = () => {
  if (bound) {
    return;
  }
  bound = true;
  AppState.addEventListener('change', (nextState) => {
    const wasForeground = currentState === 'active';
    currentState = nextState;
    if (nextState === 'active' && !wasForeground) {
      foregroundListeners.forEach((listener) => listener());
      return;
    }
    if (nextState !== 'active' && wasForeground) {
      backgroundListeners.forEach((listener) => listener());
      logger.info('lifecycle', 'app moved to background');
    }
  });
};
