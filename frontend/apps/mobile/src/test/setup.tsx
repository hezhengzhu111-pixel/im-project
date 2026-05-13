import type React from 'react';

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => {
    const react = require('react') as typeof import('react');
    const { View } = require('react-native') as typeof import('react-native');
    return react.createElement(View, null, children);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => {
    const react = require('react') as typeof import('react');
    const { View } = require('react-native') as typeof import('react-native');
    return react.createElement(View, null, children);
  },
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const react = require('react') as typeof import('react');
    const { View } = require('react-native') as typeof import('react-native');
    return react.createElement(View, null, children);
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => {
    const react = require('react') as typeof import('react');
    const { View } = require('react-native') as typeof import('react-native');
    return react.createElement(View, null, children);
  },
  createNavigationContainerRef: () => ({
    isReady: jest.fn(() => true),
    navigate: jest.fn(),
  }),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const react = require('react') as typeof import('react');
      const { View } = require('react-native') as typeof import('react-native');
      return react.createElement(View, null, children);
    },
    Screen: ({ component: Component }: { component?: React.ComponentType }) => {
      const react = require('react') as typeof import('react');
      return Component ? react.createElement(Component) : null;
    },
  }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const react = require('react') as typeof import('react');
      const { View } = require('react-native') as typeof import('react-native');
      return react.createElement(View, null, children);
    },
    Screen: ({ component: Component }: { component?: React.ComponentType }) => {
      const react = require('react') as typeof import('react');
      return Component ? react.createElement(Component) : null;
    },
  }),
}));

jest.mock('react-native-keychain', () => {
  const store = new Map<string, string>();
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
    setGenericPassword: jest.fn((key: string, value: string, options: { service: string }) => {
      store.set(options.service, value || key);
      return Promise.resolve(true);
    }),
    getGenericPassword: jest.fn((options: { service: string }) => {
      const value = store.get(options.service);
      return Promise.resolve(value ? { username: options.service, password: value } : false);
    }),
    resetGenericPassword: jest.fn((options: { service: string }) => {
      store.delete(options.service);
      return Promise.resolve(true);
    }),
  };
});

jest.mock('react-native-mmkv', () => {
  return {
    createMMKV: () => {
      const values = new Map<string, string | boolean>();
      return {
        set: (key: string, value: string | boolean) => values.set(key, value),
        getString: (key: string) => {
          const value = values.get(key);
          return typeof value === 'string' ? value : undefined;
        },
        getBoolean: (key: string) => {
          const value = values.get(key);
          return typeof value === 'boolean' ? value : undefined;
        },
        remove: (key: string) => values.delete(key),
      };
    },
  };
});

jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({})),
    clearAll: jest.fn(() => Promise.resolve(true)),
  },
}));

jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(() => {
    throw new Error('sqlite unavailable in tests');
  }),
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(() => Promise.resolve('im-messages')),
    displayNotification: jest.fn(() => Promise.resolve()),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    incrementBadgeCount: jest.fn(() => Promise.resolve()),
    onForegroundEvent: jest.fn(),
    onBackgroundEvent: jest.fn(),
    setBadgeCount: jest.fn(() => Promise.resolve()),
  },
  AndroidImportance: { HIGH: 4 },
  EventType: { PRESS: 1 },
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
    getToken: jest.fn(() => Promise.resolve('fcm-test-token')),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    onTokenRefresh: jest.fn(),
    onMessage: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    setBackgroundMessageHandler: jest.fn(),
  }),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { ANDROID: {}, IOS: {} },
  RESULTS: { GRANTED: 'granted', LIMITED: 'limited' },
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
  requestNotifications: jest.fn(() => Promise.resolve({ status: 'granted' })),
  openSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-device-info', () => ({
  getBrand: jest.fn(() => Promise.resolve('test')),
  getModel: jest.fn(() => Promise.resolve('test')),
  getSystemVersion: jest.fn(() => Promise.resolve('1')),
  getUniqueId: jest.fn(() => Promise.resolve('device')),
  isEmulator: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('react-native-blob-util', () => ({
  android: { actionViewIntent: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(() => Promise.resolve([])) }));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('react-native-nitro-sound', () => ({ __esModule: true, default: { startRecorder: jest.fn(), stopRecorder: jest.fn(), startPlayer: jest.fn(), stopPlayer: jest.fn() } }));
jest.mock('@react-native-clipboard/clipboard', () => ({ __esModule: true, default: { setString: jest.fn() } }));
