import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigation/navigationRef';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <NavigationContainer ref={navigationRef}>{children}</NavigationContainer>;
}
