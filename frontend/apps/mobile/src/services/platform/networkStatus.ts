import NetInfo from '@react-native-community/netinfo';
import { APP_CONFIG } from '@/constants/config';
import { logger } from '@/utils/logger';

type Listener = () => void;

const onlineListeners = new Set<Listener>();
const offlineListeners = new Set<Listener>();
let online = true;
let bound = false;
let configured = false;

const apiReachabilityUrl = (): string => {
  try {
    const url = new URL(APP_CONFIG.API_BASE_URL);
    url.pathname = '/health';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return APP_CONFIG.API_BASE_URL;
  }
};

const configureReachability = () => {
  if (configured || typeof NetInfo.configure !== 'function') {
    return;
  }
  configured = true;
  NetInfo.configure({
    reachabilityUrl: apiReachabilityUrl(),
    reachabilityMethod: 'GET',
    reachabilityTest: async (response) => response.status >= 200 && response.status < 500,
    useNativeReachability: false,
  });
};

const isOnlineState = (state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): boolean => {
  if (state.isConnected === false) {
    return false;
  }
  if (state.isInternetReachable === false) {
    return false;
  }
  return true;
};

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
  configureReachability();
  NetInfo.addEventListener((state) => {
    const nextOnline = isOnlineState(state);
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
