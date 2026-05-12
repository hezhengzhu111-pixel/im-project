import React, { useEffect } from 'react';
import { LoadingState } from '@/components/common/StateViews';
import { AuthNavigator } from './AuthNavigator';
import { MainTabs } from './MainTabs';
import { useAuthStore } from '@/stores/authStore';

export function RootNavigator() {
  const authReady = useAuthStore((state) => state.authReady);
  const currentUser = useAuthStore((state) => state.currentUser);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    if (!authReady) {
      void restoreSession();
    }
  }, [authReady, restoreSession]);

  if (!authReady) {
    return <LoadingState label="Restoring session..." />;
  }
  return currentUser ? <MainTabs /> : <AuthNavigator />;
}
