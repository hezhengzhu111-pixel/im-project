import type { ChatSession, Message } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

let fixtureIdCounter = 0;

function nextId(prefix: string): string {
  fixtureIdCounter++;
  return `${prefix}-${fixtureIdCounter}`;
}

/** Reset the internal ID counter so fixture IDs are deterministic within a test. */
export function resetFixtureCounters(): void {
  fixtureIdCounter = 0;
}

// ─── Message fixtures ──────────────────────────────────────────────

export function textMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('msg'),
    messageId: `svr-msg-${fixtureIdCounter}`,
    senderId: 'user-1',
    senderName: 'Alice',
    receiverId: 'user-2',
    isGroupChat: false,
    messageType: 'TEXT',
    content: 'Hello, how are you?',
    sendTime: '2026-05-17T10:00:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

export function imageMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('img'),
    messageId: `svr-img-${fixtureIdCounter}`,
    senderId: 'user-1',
    senderName: 'Alice',
    receiverId: 'user-2',
    isGroupChat: false,
    messageType: 'IMAGE',
    content: '[Image]',
    mediaUrl: 'https://files.example.com/images/photo_20260517.jpg',
    mediaSize: 102400,
    mediaName: 'photo_20260517.jpg',
    thumbnailUrl: 'https://files.example.com/images/thumb_photo_20260517.jpg',
    sendTime: '2026-05-17T10:01:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

export function videoMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('vid'),
    messageId: `svr-vid-${fixtureIdCounter}`,
    senderId: 'user-2',
    senderName: 'Bob',
    receiverId: 'user-1',
    isGroupChat: false,
    messageType: 'VIDEO',
    content: '[Video]',
    mediaUrl: 'https://files.example.com/videos/clip_20260517.mp4',
    mediaSize: 5242880,
    mediaName: 'clip_20260517.mp4',
    thumbnailUrl: 'https://files.example.com/videos/thumb_clip_20260517.jpg',
    duration: 15,
    sendTime: '2026-05-17T10:02:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

export function voiceMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('voice'),
    messageId: `svr-voice-${fixtureIdCounter}`,
    senderId: 'user-1',
    senderName: 'Alice',
    receiverId: 'user-2',
    isGroupChat: false,
    messageType: 'VOICE',
    content: '[Voice]',
    mediaUrl: 'https://files.example.com/audio/msg_20260517.m4a',
    mediaSize: 48000,
    mediaName: 'msg_20260517.m4a',
    duration: 8,
    sendTime: '2026-05-17T10:03:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

export function fileMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('file'),
    messageId: `svr-file-${fixtureIdCounter}`,
    senderId: 'user-1',
    senderName: 'Alice',
    receiverId: 'user-2',
    isGroupChat: false,
    messageType: 'FILE',
    content: '[File]',
    mediaUrl: 'https://files.example.com/docs/report_20260517.pdf',
    mediaSize: 2048000,
    mediaName: 'report_20260517.pdf',
    sendTime: '2026-05-17T10:04:00.000Z',
    status: 'SENT',
    ...overrides,
  };
}

export function failedLocalMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return {
    id: nextId('failed'),
    messageId: undefined,
    senderId: 'user-1',
    senderName: 'Alice',
    receiverId: 'user-2',
    isGroupChat: false,
    messageType: 'TEXT',
    content: 'This send failed',
    sendTime: '2026-05-17T10:05:00.000Z',
    status: 'FAILED',
    ...overrides,
  };
}

export function sentOwnMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return textMessage({
    senderId: 'current-user',
    senderName: 'Me',
    status: 'SENT',
    ...overrides,
  });
}

export function sentOtherMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return textMessage({
    senderId: 'other-user',
    senderName: 'Charlie',
    receiverId: 'current-user',
    status: 'SENT',
    ...overrides,
  });
}

export function encryptedMessage(overrides: Partial<MobileMessage> = {}): MobileMessage {
  return textMessage({
    encrypted: true,
    e2eeHeader: 'AAEC',
    e2eeDeviceId: 'device-xyz',
    e2eeSenderIdentityKey: 'a2V5LWFiYw==',
    e2eeEphemeralKey: 'ZXBoZW1lcmFsLWtleQ==',
    ...overrides,
  });
}

// ─── Batch helpers ─────────────────────────────────────────────────

export function mixedMessageSet(): MobileMessage[] {
  return [
    textMessage(),
    imageMessage(),
    videoMessage(),
    voiceMessage(),
    fileMessage(),
  ];
}

// ─── ChatSession fixtures ──────────────────────────────────────────

export function privateSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const msg = textMessage();
  return {
    id: 'private_user-1_user-2',
    type: 'private',
    targetId: 'user-2',
    targetName: 'Bob',
    targetAvatar: 'https://files.example.com/avatars/bob.jpg',
    lastMessage: msg,
    lastMessageTime: msg.sendTime,
    lastMessageSenderId: msg.senderId,
    unreadCount: 3,
    isPinned: false,
    isMuted: false,
    ...overrides,
  };
}

export function groupSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const msg = textMessage({ groupId: 'group-1', senderName: 'David', content: 'Group announcement' });
  return {
    id: 'group_group-1',
    type: 'group',
    targetId: 'group-1',
    targetName: 'Project Team',
    targetAvatar: 'https://files.example.com/avatars/group_team.jpg',
    lastMessage: msg,
    lastMessageTime: msg.sendTime,
    lastMessageSenderId: msg.senderId,
    unreadCount: 12,
    memberCount: 15,
    isPinned: true,
    isMuted: false,
    ...overrides,
  };
}

export function emptySession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'private_user-1_user-3',
    type: 'private',
    targetId: 'user-3',
    targetName: 'Eve',
    unreadCount: 0,
    ...overrides,
  };
}

export function sessionWithLastMessage(lastMessage: Message): ChatSession {
  return privateSession({ lastMessage, lastMessageTime: lastMessage.sendTime });
}
