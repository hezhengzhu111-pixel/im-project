import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { STORAGE_KEYS } from '@/constants/config';
import { pushDeviceService } from '@/services/push/pushDeviceService';
import { kvStorage } from '@/services/storage/kvStorage';
import { initializeStorage } from '@/services/storage/messageDatabase';
import { notificationEventRepository } from '@/services/storage/notificationEventRepository';
import { permissions } from '@/app/permissions/permissions';
import { navigationRef } from '@/app/navigation/navigationRef';
import { logger } from '@/utils/logger';
import type { ChatRouteParams, MobileMessage } from '@/types/models';

const CHANNEL_ID = 'im-messages';
const PENDING_NOTIFICATION_ROUTE_KEY = 'im.mobile.pending-notification-route';
const SENSITIVE_DATA_KEYS = ['token', 'cookie', 'password', 'apikey', 'api_key', 'authorization', 'secret'];

let initialized = false;
let backgroundHandlersRegistered = false;
let fcmUnavailableLogged = false;
let chatRouteAuthReady = false;
let lastNavigatedChatRouteKey = '';

const getMessaging = (): ReturnType<typeof messaging> | null => {
  try {
    return messaging();
  } catch (error) {
    if (!fcmUnavailableLogged) {
      fcmUnavailableLogged = true;
      logger.warn('notification', 'Firebase Messaging unavailable; FCM disabled for this run', error);
    }
    return null;
  }
};

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

const hasValue = (value?: string): value is string => Boolean(value && value.trim());

const isChatRouteData = (data: Record<string, string>): boolean => {
  const route = data.route || '';
  if (route && route !== 'Chat' && route !== 'ChatScreen' && route !== 'ChatStack') {
    return false;
  }
  return (
    route === 'Chat' ||
    route === 'ChatScreen' ||
    route === 'ChatStack' ||
    hasValue(data.conversationId) ||
    hasValue(data.sessionId) ||
    hasValue(data.senderId) ||
    hasValue(data.groupId) ||
    hasValue(data.targetId)
  );
};

const routeNameFromData = (data: Record<string, string>): string | undefined => {
  const route = data.route || '';
  if (route === 'FriendRequests') {
    return 'FriendRequestsScreen';
  }
  if (isChatRouteData(data)) {
    return 'ChatScreen';
  }
  return route || undefined;
};

const normalizeChatRouteParams = (data: Record<string, string>): ChatRouteParams => ({
  route: 'Chat',
  conversationId: data.conversationId || undefined,
  sessionId: data.sessionId || undefined,
  senderId: data.senderId || undefined,
  receiverId: data.receiverId || undefined,
  groupId: data.groupId || undefined,
  targetId: data.targetId || undefined,
  targetName: data.targetName || undefined,
  groupName: data.groupName || undefined,
  senderName: data.senderName || undefined,
});

const hasChatRouteTarget = (params: ChatRouteParams): boolean =>
  Boolean(
    params.conversationId ||
      params.sessionId ||
      params.groupId ||
      params.senderId ||
      params.receiverId ||
      params.targetId,
  );

const chatRouteKey = (params: ChatRouteParams): string =>
  [
    params.sessionId,
    params.conversationId,
    params.groupId,
    params.senderId,
    params.receiverId,
    params.targetId,
  ]
    .filter(Boolean)
    .join('|');

const storePendingNotificationRoute = (data: Record<string, string>) => {
  kvStorage.setJson(PENDING_NOTIFICATION_ROUTE_KEY, data);
};

const currentRouteName = (): string => {
  const route = navigationRef.getCurrentRoute() as { name?: string } | undefined;
  return route?.name || '';
};

const routeFromNotification = (data?: Record<string, unknown>): boolean => {
  const safeData = sanitizeNotificationData(data);
  const shouldOpenChat = isChatRouteData(safeData);
  const shouldOpenFriendRequests = safeData.route === 'FriendRequests';
  if (!shouldOpenChat && !shouldOpenFriendRequests) {
    return true;
  }
  if (!navigationRef.isReady()) {
    storePendingNotificationRoute(safeData);
    return false;
  }
  if (shouldOpenChat) {
    if (!chatRouteAuthReady) {
      storePendingNotificationRoute(safeData);
      return false;
    }
    const params = normalizeChatRouteParams(safeData);
    if (!hasChatRouteTarget(params)) {
      return true;
    }
    const key = chatRouteKey(params);
    if (key && lastNavigatedChatRouteKey === key && currentRouteName() === 'ChatScreen') {
      return true;
    }
    lastNavigatedChatRouteKey = key;
    (navigationRef.navigate as (name: string, params?: object) => void)('ChatStack', {
      screen: 'ChatScreen',
      params,
    });
    return true;
  }
  if (safeData.route === 'FriendRequests') {
    (navigationRef.navigate as (name: string, params?: object) => void)('ContactsStack', {
      screen: 'FriendRequestsScreen',
    });
    return true;
  }
  return true;
};

export function flushPendingNotificationRoute(): void {
  const pending = kvStorage.getJson<Record<string, string> | null>(PENDING_NOTIFICATION_ROUTE_KEY, null);
  if (!pending) {
    return;
  }
  if (routeFromNotification(pending)) {
    kvStorage.remove(PENDING_NOTIFICATION_ROUTE_KEY);
  }
}

export function clearPendingNotificationRoute(): void {
  kvStorage.remove(PENDING_NOTIFICATION_ROUTE_KEY);
}

export function setNotificationRouteAuthReady(ready: boolean): void {
  chatRouteAuthReady = ready;
  if (ready) {
    flushPendingNotificationRoute();
  }
}

async function handleNotificationOpen(
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
  const firebaseMessaging = getMessaging();
  firebaseMessaging?.onTokenRefresh((token) => {
    void handleFcmTokenRefresh(token);
  });
  firebaseMessaging?.onMessage(async (message) => {
    await displaySystemNotification(
      message.notification?.title || 'IM',
      message.notification?.body || 'New notification',
      message.data,
    );
  });
  firebaseMessaging?.onNotificationOpenedApp((message) => {
    void handleNotificationOpen(message.data, 'fcm_notification_opened');
  });
  const [notifeeInitial, messagingInitial] = await Promise.allSettled([
    notifee.getInitialNotification(),
    firebaseMessaging?.getInitialNotification() ?? Promise.resolve(null),
  ]);
  if (notifeeInitial.status === 'fulfilled' && notifeeInitial.value?.notification?.data) {
    await handleNotificationOpen(notifeeInitial.value.notification.data, 'notifee_initial_notification');
  }
  if (messagingInitial.status === 'fulfilled' && messagingInitial.value?.data) {
    await handleNotificationOpen(messagingInitial.value.data, 'fcm_initial_notification');
  }
  flushPendingNotificationRoute();
}

export async function handleFcmTokenRefresh(token: string): Promise<void> {
  const previousToken = kvStorage.getString(STORAGE_KEYS.fcmToken);
  kvStorage.setString(STORAGE_KEYS.fcmToken, token);
  notificationEventRepository.record('fcm_token_refresh');
  if (!token || token === previousToken) {
    return;
  }
  try {
    await pushDeviceService.updateDeviceToken(token);
  } catch (error) {
    pushDeviceService.logOptionalFailure('update device token', error);
  }
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
  const firebaseMessaging = getMessaging();
  firebaseMessaging?.setBackgroundMessageHandler(async (message: FirebaseMessagingTypes.RemoteMessage) => {
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
  const firebaseMessaging = getMessaging();
  if (!firebaseMessaging) {
    return '';
  }
  try {
    await firebaseMessaging.registerDeviceForRemoteMessages();
    const token = await firebaseMessaging.getToken();
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
