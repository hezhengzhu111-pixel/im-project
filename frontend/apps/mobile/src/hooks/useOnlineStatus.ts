import { useEffect, useState } from 'react';
import { networkStatus } from '@/services/platform/networkStatus';

export function useOnlineStatus() {
  const [online, setOnline] = useState(networkStatus.isOnline());

  useEffect(() => {
    const offOnline = networkStatus.onOnline(() => setOnline(true));
    const offOffline = networkStatus.onOffline(() => setOnline(false));
    return () => {
      offOnline();
      offOffline();
    };
  }, []);

  return online;
}
