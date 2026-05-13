import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { STORAGE_KEYS } from '@/constants/config';
import { kvStorage } from '@/services/storage/kvStorage';
import { initializeStorage } from '@/services/storage/messageDatabase';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { permissions } from '@/app/permissions/permissions';
import { navigationRef } from '@/app/navigation/navigationRef';
import { logger } from '@/utils/logger';
import type { MobileMessage } from '@/types/models';

const CHANNEL_ID = 'im-messages';
const PENDING_NOTIFICATION_ROUTE_KEY = 'im.mobile.pending-notification-route';
const SENSITIVE_DATA_KEYS = ['token', 'cookie', 'password', 'apikey', 'api_key', 'authorization', 'secret'];

let initialized = false;
let backgroundHandlersRegistered = false;

const shouldRedactKey = (key: string) => {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  return SENSITIVE_DATA_KEYS.some((part) => normalized.includes(part.replace(/[-_]/g, '')));
};

const sanitizeNotificationData = (data?: Record<string, unknown>): Record<string, string> => {
  if (!data) {
    return {};
  }
  return Object.entries(data).reduce<Record<string, string>>((result, [key, value]) => {
    result[key] = shouldRedactKey(key) ? '[REDACTED]' : String(value ?? '');
    return result;
  }, {});
};

const routeNameFromData = (data: Record<string, string>): string | undefined => {
  const route = data.route || '';
  if (route === 'Chat') {
    return 'ChatScreen';
  }
  if (route === 'FriendRequests') {
    return 'FriendRequestsScreen';
  }
  return route || undefined;
};

const routeFromNotification = (data?: Record<string, unknown>) => {
  const safeData = sanitizeNotificationData(data);
  const route = safeData.route || '';
  if (!route) {
    return;
  }
  if (!navigationRef.isReady()) {
    kvStorage.setJson(PENDING_NOTIFICATION_ROUTE_KEY, safeData);
    return;
  }
  if (route === 'Chat') {
    (navigationRef.navigate as (name: string, params?: object) => void)('ChatStack', {
      screen: 'ChatScreen',
      params: {
        sessionId: safeData.conversationId || undefined,
        senderId: safeData.senderId || undefined,
        groupId: safeData.groupId || undefined,
      },
    });
    return;
  }
  if (route === 'FriendRequests') {
    (navigationRef.navigate as (name: string, params?: object) => void)('ContactsStack', {
      screen: 'FriendRequestsScreen',
    });
  }
};

export function flushPendingNotificationRoute(): void {
  const pending = kvStorage.getJson<Record<string, string> | null>(PENDING_NOTIFICATION_ROUTE_KEY, null);
  if (!pending) {
    return;
  }
  kvStorage.remove(PENDING_NOTIFICATION_ROUTE_KEY);
  routeFromNotification(pending);
}

export async function handleNotificationOpen(
  data?: Record<string, unknown>,
  eventType = 'notification_opened',
): Promise<void> {
  const safeData = sanitizeNotificationData(data);
  notificationEventRepository.record(eventType, routeNameFromData(safeData), safeData);
  routeFromNotification(safeData);
}

export async function initializeNotifications(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;
  await permissions.notifications().catch((error) => {
    logger.warn('notification', 'notification permission request failed', error);
  });
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'IM Messages',
    importance: AndroidImportance.HIGH,
  });
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      void handleNotificationOpen(detail.notification?.data, 'notifee_foreground_press');
    }
  });
  messaging().onTokenRefresh((token) => {
    kvStorage.setString(STORAGE_KEYS.fcmToken, token);
    notificationEventRepository.record('fcm_token_refresh');
  });
  messaging().onMessage(async (message) => {
    await displaySystemNotification(
      message.notification?.title || 'IM',
      message.notification?.body || 'New notification',
      message.data,
    );
  });
  messaging().onNotificationOpenedApp((message) => {
    void handleNotificationOpen(message.data, 'fcm_notification_opened');
  });
  const [notifeeInitial, messagingInitial] = await Promise.allSettled([
    notifee.getInitialNotification(),
    messaging().getInitialNotification(),
  ]);
  if (notifeeInitial.status === 'fulfilled' && notifeeInitial.value?.notification?.data) {
    await handleNotificationOpen(notifeeInitial.value.notification.data, 'notifee_initial_notification');
  }
  if (messagingInitial.status === 'fulfilled' && messagingInitial.value?.data) {
    await handleNotificationOpen(messagingInitial.value.data, 'fcm_initial_notification');
  }
  flushPendingNotificationRoute();
}

export function registerNotificationBackgroundHandlers(): void {
  if (backgroundHandlersRegistered) {
    return;
  }
  backgroundHandlersRegistered = true;
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    await initializeStorage();
    if (type === EventType.PRESS) {
      await handleNotificationOpen(detail.notification?.data, 'notifee_background_press');
    }
  });
  messaging().setBackgroundMessageHandler(async (message: FirebaseMessagingTypes.RemoteMessage) => {
    await initializeStorage();
    notificationEventRepository.record('fcm_background_message', undefined, sanitizeNotificationData(message.data));
    await displaySystemNotification(
      message.notification?.title || 'IM',
      message.notification?.body || 'New notification',
      message.data,
    );
  });
}

export async function getFcmToken(): Promise<string> {
  try {
    await messaging().registerDeviceForRemoteMessages();
    const token = await messaging().getToken();
    kvStorage.setString(STORAGE_KEYS.fcmToken, token);
    return token;
  } catch (error) {
    logger.warn('notification', 'FCM token unavailable', error);
    return '';
  }
}

export async function displayMessageNotification(message: MobileMessage): Promise<void> {
  const title = message.groupId ? message.groupName || 'Group message' : message.senderName || 'New message';
  const body = message.encrypted ? 'Encrypted message' : message.content || message.mediaName || message.messageType;
  await displaySystemNotification(title, body, {
    route: 'Chat',
    conversationId: message.conversationId || '',
    senderId: message.senderId,
    groupId: message.groupId || '',
  });
}

export async function displaySystemNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const safeData = sanitizeNotificationData(data);
  const routeName = routeNameFromData(safeData);
  const enabled = kvStorage.getBoolean('notification.enabled', true);
  if (!enabled) {
    notificationEventRepository.record('notification_suppressed', routeName, safeData);
    return;
  }
  notificationEventRepository.record('notification_displayed', routeName, safeData);
  await notifee.displayNotification({
    title,
    body,
    data: safeData,
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: 'default' },
      sound: kvStorage.getBoolean('sound.enabled', true) ? 'default' : undefined,
    },
  });
  await notifee.incrementBadgeCount(1).catch((error) => {
    logger.warn('notification', 'badge increment failed', error);
  });
}
