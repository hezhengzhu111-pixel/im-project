import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigation/navigationRef';
import { flushPendingNotificationRoute } from '@/services/notification/notificationService';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <NavigationContainer ref={navigationRef} onReady={flushPendingNotificationRoute}>{children}</NavigationContainer>;
}
