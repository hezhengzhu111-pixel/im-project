import React, { useEffect } from 'react';
import { LoadingState } from '@/components/common/StateViews';
import { AuthNavigator } from './AuthNavigator';
import { MainTabs } from './MainTabs';
import { useAuthStore } from '@/stores/authStore';
import { setNotificationRouteAuthReady } from '@/services/notification/notificationService';

export function RootNavigator() {
  const authReady = useAuthStore((state) => state.authReady);
  const currentUser = useAuthStore((state) => state.currentUser);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    if (!authReady) {
      void restoreSession();
    }
  }, [authReady, restoreSession]);

  useEffect(() => {
    setNotificationRouteAuthReady(authReady && Boolean(currentUser));
  }, [authReady, currentUser]);

  if (!authReady) {
    return <LoadingState label="Restoring session..." />;
  }
  return currentUser ? <MainTabs /> : <AuthNavigator />;
}
