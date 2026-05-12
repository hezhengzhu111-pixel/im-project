import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { STORAGE_KEYS } from '@/constants/config';
import { kvStorage } from '@/services/storage/kvStorage';
import { permissions } from '@/app/permissions/permissions';
import { navigationRef } from '@/app/navigation/navigationRef';
import { logger } from '@/utils/logger';
import type { MobileMessage } from '@/types/models';

const CHANNEL_ID = 'im-messages';

export async function initializeNotifications(): Promise<void> {
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
      routeFromNotification(detail.notification?.data);
    }
  });
  messaging().onTokenRefresh((token) => {
    kvStorage.setString(STORAGE_KEYS.fcmToken, token);
  });
  messaging().onMessage(async (message) => {
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
  const enabled = kvStorage.getBoolean('notification.enabled', true);
  if (!enabled) {
    return;
  }
  await notifee.displayNotification({
    title,
    body,
    data: data as Record<string, string>,
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: 'default' },
      sound: kvStorage.getBoolean('sound.enabled', true) ? 'default' : undefined,
    },
  });
}

const routeFromNotification = (data?: Record<string, unknown>) => {
  if (!data) {
    return;
  }
  const route = String(data.route || '');
  if (route === 'Chat') {
    (navigationRef.navigate as (name: string, params?: object) => void)('ChatStack', {
      screen: 'ChatScreen',
      params: data,
    });
  }
  if (route === 'FriendRequests') {
    (navigationRef.navigate as (name: string, params?: object) => void)('ContactsStack', {
      screen: 'FriendRequestsScreen',
    });
  }
};
