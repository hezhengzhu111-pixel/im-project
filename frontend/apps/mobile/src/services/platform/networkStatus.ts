import NetInfo from '@react-native-community/netinfo';
import { logger } from '@/utils/logger';

type Listener = () => void;

const onlineListeners = new Set<Listener>();
const offlineListeners = new Set<Listener>();
let online = true;
let bound = false;

export const networkStatus = {
  isOnline(): boolean {
    return online;
  },
  onOnline(listener: Listener): () => void {
    onlineListeners.add(listener);
    return () => onlineListeners.delete(listener);
  },
  onOffline(listener: Listener): () => void {
    offlineListeners.add(listener);
    return () => offlineListeners.delete(listener);
  },
};

export const bindNetworkHandlers = () => {
  if (bound) {
    return;
  }
  bound = true;
  NetInfo.addEventListener((state) => {
    const nextOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (nextOnline === online) {
      return;
    }
    online = nextOnline;
    if (online) {
      onlineListeners.forEach((listener) => listener());
    } else {
      offlineListeners.forEach((listener) => listener());
      logger.warn('network', 'network unavailable');
    }
  });
};
