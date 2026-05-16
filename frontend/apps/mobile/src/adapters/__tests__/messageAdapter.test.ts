import {
  toSharedMessage,
  toMobileMessage,
  normalizeMobileMessage,
  hasSameMobileMessageIdentity,
  mergeServerMobileMessageWithPending,
  applyMobileMessageToList,
} from '../messageAdapter';
import type { MobileMessage } from '@/types/models';
import type { Message } from '@im/shared-types';

const baseMobile = (overrides: Partial<MobileMessage> = {}): MobileMessage => ({
  id: '1',
  messageId: '1',
  senderId: 'u1',
  isGroupChat: false,
  messageType: 'TEXT',
  content: 'hello',
  sendTime: '2024-06-01T10:00:00.000Z',
  status: 'SENT',
  ...overrides,
});

describe('messageAdapter', () => {
  // ─── toSharedMessage ────────────────────────────────────────────────────
  describe('toSharedMessage', () => {
    it('maps serverId to messageId when messageId is absent', () => {
      const mobile = baseMobile({ id: '1', messageId: undefined, serverId: 'srv_1' });
      const shared = toSharedMessage(mobile);
      expect(shared.messageId).toBe('srv_1');
      expect(shared.id).toBe('srv_1');
    });

    it('prefers messageId over serverId', () => {
      const mobile = baseMobile({ messageId: 'msg_1', serverId: 'srv_1' });
      const shared = toSharedMessage(mobile);
      expect(shared.id).toBe('msg_1');
      expect(shared.messageId).toBe('msg_1');
    });

    it('preserves encrypted as truthy when set to 1', () => {
      const mobile = baseMobile({ encrypted: 1 as unknown as boolean });
      const shared = toSharedMessage(mobile);
      expect(shared.encrypted).toBeTruthy();
    });

    it('preserves encrypted as falsy when set to 0', () => {
      const mobile = baseMobile({ encrypted: 0 as unknown as boolean });
      const shared = toSharedMessage(mobile);
      expect(shared.encrypted).toBeFalsy();
    });

    it('preserves encrypted boolean true', () => {
      const mobile = baseMobile({ encrypted: true });
      const shared = toSharedMessage(mobile);
      expect(shared.encrypted).toBe(true);
    });

    it('preserves media fields', () => {
      const mobile = baseMobile({
        mediaUrl: 'https://example.com/img.jpg',
        mediaSize: 1024,
        mediaName: 'img.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 30,
      });
      const shared = toSharedMessage(mobile);
      expect(shared.mediaUrl).toBe('https://example.com/img.jpg');
      expect(shared.mediaSize).toBe(1024);
      expect(shared.mediaName).toBe('img.jpg');
      expect(shared.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(shared.duration).toBe(30);
    });

    it('preserves readBy and readByCount', () => {
      const mobile = baseMobile({ readBy: ['u2', 'u3'], readByCount: 2 });
      const shared = toSharedMessage(mobile);
      expect(shared.readBy).toEqual(['u2', 'u3']);
      expect(shared.readByCount).toBe(2);
    });

    it('preserves E2EE fields', () => {
      const mobile = baseMobile({
        e2eeHeader: 'header',
        e2eeDeviceId: 'device1',
        e2eeSenderIdentityKey: 'key',
        e2eeEphemeralKey: 'ephemeral',
      });
      const shared = toSharedMessage(mobile);
      expect(shared.e2eeHeader).toBe('header');
      expect(shared.e2eeDeviceId).toBe('device1');
      expect(shared.e2eeSenderIdentityKey).toBe('key');
      expect(shared.e2eeEphemeralKey).toBe('ephemeral');
    });

    it('preserves AI fields', () => {
      const mobile = baseMobile({
        isAiGenerated: true,
        aiProvider: 'deepseek',
        aiModel: 'deepseek-chat',
      });
      const shared = toSharedMessage(mobile);
      expect(shared.isAiGenerated).toBe(true);
      expect(shared.aiProvider).toBe('deepseek');
      expect(shared.aiModel).toBe('deepseek-chat');
    });

    it('derives isGroupChat from groupId when isGroupChat is false', () => {
      const mobile = baseMobile({ isGroupChat: false, groupId: 'g1' });
      const shared = toSharedMessage(mobile);
      expect(shared.isGroupChat).toBe(true);
    });

    it('defaults content to empty string', () => {
      const mobile = baseMobile({ content: undefined as unknown as string });
      const shared = toSharedMessage(mobile);
      expect(shared.content).toBe('');
    });

    it('defaults status to SENT', () => {
      const mobile = baseMobile({ status: undefined });
      const shared = toSharedMessage(mobile);
      expect(shared.status).toBe('SENT');
    });
  });

  // ─── toMobileMessage ────────────────────────────────────────────────────
  describe('toMobileMessage', () => {
    it('maps messageId to serverId', () => {
      const shared: Message = {
        id: '1',
        messageId: 'msg_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const mobile = toMobileMessage(shared);
      expect(mobile.serverId).toBe('msg_1');
    });

    it('extracts serverId from raw record', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const raw = { serverId: 'srv_raw', conversationId: 'conv_1' };
      const mobile = toMobileMessage(shared, raw);
      expect(mobile.serverId).toBe('srv_raw');
      expect(mobile.conversationId).toBe('conv_1');
    });

    it('extracts serverId from snake_case raw fields', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const raw = { server_id: 'srv_snake', conversation_id: 'conv_snake' };
      const mobile = toMobileMessage(shared, raw);
      expect(mobile.serverId).toBe('srv_snake');
      expect(mobile.conversationId).toBe('conv_snake');
    });

    it('generates rawJson from raw when provided', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const raw = { id: '1', content: 'hello' };
      const mobile = toMobileMessage(shared, raw);
      expect(mobile.rawJson).toBe(JSON.stringify(raw));
    });

    it('generates rawJson from shared message when raw is not a record', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const mobile = toMobileMessage(shared, 'not-a-record');
      expect(mobile.rawJson).toBe(JSON.stringify(shared));
    });

    it('passes encrypted number through when raw has numeric encrypted', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const raw = { encrypted: 1 };
      const mobile = toMobileMessage(shared, raw);
      expect(mobile.encrypted).toBeTruthy();
    });

    it('passes encrypted 0 through when raw has numeric encrypted', () => {
      const shared: Message = {
        id: '1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00.000Z',
        status: 'SENT',
      };
      const raw = { encrypted: 0 };
      const mobile = toMobileMessage(shared, raw);
      expect(mobile.encrypted).toBeFalsy();
    });
  });

  // ─── normalizeMobileMessage ─────────────────────────────────────────────
  describe('normalizeMobileMessage', () => {
    it('normalizes raw DTO through shared normalizer then to MobileMessage', () => {
      const raw = {
        id: '100',
        senderId: 'u1',
        messageType: 'TEXT',
        content: 'test',
        status: 1,
        sendTime: '2024-06-01T10:00:00.000Z',
        serverId: 'srv_100',
        conversationId: 'conv_1',
      };
      const mobile = normalizeMobileMessage(raw);
      expect(mobile.id).toBe('100');
      expect(mobile.senderId).toBe('u1');
      expect(mobile.messageType).toBe('TEXT');
      expect(mobile.content).toBe('test');
      expect(mobile.status).toBe('SENT');
      expect(mobile.serverId).toBe('srv_100');
      expect(mobile.conversationId).toBe('conv_1');
      expect(mobile.rawJson).toBeDefined();
    });

    it('handles snake_case raw DTO', () => {
      const raw = {
        id: '200',
        sender_id: 'u2',
        messageType: 'IMAGE',
        media_url: 'https://example.com/img.jpg',
        status: 2,
        created_at: '2024-06-01T10:00:00.000Z',
      };
      const mobile = normalizeMobileMessage(raw);
      expect(mobile.id).toBe('200');
      expect(mobile.senderId).toBe('u2');
      expect(mobile.messageType).toBe('IMAGE');
      expect(mobile.mediaUrl).toBe('https://example.com/img.jpg');
      expect(mobile.status).toBe('DELIVERED');
    });

    it('preserves E2EE fields through full pipeline', () => {
      const raw = {
        id: '300',
        senderId: 'u1',
        messageType: 'TEXT',
        content: 'encrypted',
        status: 1,
        sendTime: '2024-06-01T10:00:00.000Z',
        encrypted: true,
        e2eeHeader: 'hdr',
        e2eeDeviceId: 'dev1',
        e2eeSenderIdentityKey: 'ik',
        e2eeEphemeralKey: 'ek',
      };
      const mobile = normalizeMobileMessage(raw);
      expect(mobile.encrypted).toBe(true);
      expect(mobile.e2eeHeader).toBe('hdr');
      expect(mobile.e2eeDeviceId).toBe('dev1');
      expect(mobile.e2eeSenderIdentityKey).toBe('ik');
      expect(mobile.e2eeEphemeralKey).toBe('ek');
    });

    it('preserves AI fields through full pipeline', () => {
      const raw = {
        id: '400',
        senderId: 'u1',
        messageType: 'AI_REPLY',
        content: 'ai response',
        status: 1,
        sendTime: '2024-06-01T10:00:00.000Z',
        isAiGenerated: true,
        aiProvider: 'deepseek',
        aiModel: 'deepseek-chat',
      };
      const mobile = normalizeMobileMessage(raw);
      expect(mobile.isAiGenerated).toBe(true);
      expect(mobile.aiProvider).toBe('deepseek');
      expect(mobile.aiModel).toBe('deepseek-chat');
      expect(mobile.messageType).toBe('AI_REPLY');
    });

    it('uses fallbackTime when raw has no time fields', () => {
      const raw = { id: '500', senderId: 'u1', content: 'no time' };
      const fallback = '2025-01-01T00:00:00.000Z';
      const mobile = normalizeMobileMessage(raw, fallback);
      expect(mobile.sendTime).toBe(fallback);
    });
  });

  // ─── hasSameMobileMessageIdentity ───────────────────────────────────────
  describe('hasSameMobileMessageIdentity', () => {
    it('returns true for same serverId', () => {
      const a = baseMobile({ serverId: 'srv_1', id: '1' });
      const b = baseMobile({ serverId: 'srv_1', id: '2' });
      expect(hasSameMobileMessageIdentity(a, b)).toBe(true);
    });

    it('returns true for same clientMessageId', () => {
      const a = baseMobile({ clientMessageId: 'client_1', id: '1' });
      const b = baseMobile({ clientMessageId: 'client_1', id: '2' });
      expect(hasSameMobileMessageIdentity(a, b)).toBe(true);
    });

    it('returns false for different messages', () => {
      const a = baseMobile({ id: '1', messageId: 'msg_1', serverId: 'srv_1' });
      const b = baseMobile({ id: '2', messageId: 'msg_2', serverId: 'srv_2' });
      expect(hasSameMobileMessageIdentity(a, b)).toBe(false);
    });
  });

  // ─── mergeServerMobileMessageWithPending ────────────────────────────────
  describe('mergeServerMobileMessageWithPending', () => {
    it('merges server message with pending, preferring server id', () => {
      const pending = baseMobile({
        id: 'local_1',
        clientMessageId: 'c1',
        content: 'hello',
        status: 'SENT',
      });
      const server = baseMobile({
        id: 'server_1',
        serverId: 'server_1',
        clientMessageId: 'c1',
        content: 'hello',
        status: 'DELIVERED',
        sendTime: '2024-06-01T10:00:01.000Z',
      });
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.clientMessageId).toBe('c1');
      expect(merged.status).toBe('DELIVERED');
    });

    it('prefers server sendTime', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'hello',
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.sendTime).toBe('2024-06-01T10:00:01Z');
    });

    it('preserves local mediaUrl when server has no mediaUrl', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        mediaUrl: 'file:///local/photo.jpg',
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.mediaUrl).toBe('file:///local/photo.jpg');
    });

    it('uses server mediaUrl when server has mediaUrl', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        mediaUrl: 'file:///local/photo.jpg',
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
    });

    it('preserves local thumbnailUrl when server has no thumbnailUrl', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        mediaUrl: 'file:///local/photo.jpg',
        thumbnailUrl: 'file:///local/thumb.jpg',
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.thumbnailUrl).toBe('file:///local/thumb.jpg');
    });

    it('preserves local mediaName and mediaSize when server has none', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        mediaUrl: 'file:///local/doc.pdf',
        mediaName: 'doc.pdf',
        mediaSize: 2048,
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.mediaName).toBe('doc.pdf');
      expect(merged.mediaSize).toBe(2048);
    });

    it('uses server mediaName and mediaSize when server provides them', () => {
      const pending: MobileMessage = {
        id: 'local_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        mediaUrl: 'file:///local/doc.pdf',
        mediaName: 'doc.pdf',
        mediaSize: 2048,
        sendTime: '2024-06-01T10:00:00Z',
        status: 'SENDING',
      };
      const server: MobileMessage = {
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'cm_1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        mediaUrl: 'https://cdn.example.com/doc.pdf',
        mediaName: 'doc-server.pdf',
        mediaSize: 4096,
        sendTime: '2024-06-01T10:00:01Z',
        status: 'SENT',
      };
      const merged = mergeServerMobileMessageWithPending(pending, server);
      expect(merged.mediaName).toBe('doc-server.pdf');
      expect(merged.mediaSize).toBe(4096);
    });
  });

  // ─── applyMobileMessageToList ───────────────────────────────────────────
  describe('applyMobileMessageToList', () => {
    it('appends new message to empty list', () => {
      const msg = baseMobile({ id: '1' });
      const result = applyMobileMessageToList([], msg);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('merges with existing message of same identity', () => {
      const existing = baseMobile({ id: '1', serverId: 'srv_1', status: 'SENT' });
      const incoming = baseMobile({ id: 'srv_1', serverId: 'srv_1', status: 'DELIVERED' });
      const result = applyMobileMessageToList([existing], incoming);
      expect(result).toHaveLength(1);
    });

    it('appends message with different identity', () => {
      const existing = baseMobile({ id: '1', messageId: 'msg_1', serverId: 'srv_1' });
      const incoming = baseMobile({ id: '2', messageId: 'msg_2', serverId: 'srv_2' });
      const result = applyMobileMessageToList([existing], incoming);
      expect(result).toHaveLength(2);
    });

    it('sorts messages by sendTime ascending', () => {
      const later = baseMobile({ id: '2', messageId: 'msg_2', sendTime: '2024-06-02T10:00:00.000Z' });
      const earlier = baseMobile({ id: '1', messageId: 'msg_1', sendTime: '2024-06-01T10:00:00.000Z' });
      const result = applyMobileMessageToList([later], earlier);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('merges pending with server echo by clientMessageId', () => {
      const pending = baseMobile({
        id: 'local_1',
        clientMessageId: 'client_abc',
        content: 'hello',
        status: 'SENDING',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      const serverEcho = baseMobile({
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'client_abc',
        content: 'hello',
        status: 'SENT',
        sendTime: '2024-06-01T10:00:01.000Z',
      });

      const result = applyMobileMessageToList([pending], serverEcho);

      expect(result).toHaveLength(1);
      // Should keep clientMessageId for pending cleanup
      expect(result[0].clientMessageId).toBe('client_abc');
      // Should adopt server status
      expect(result[0].status).toBe('SENT');
    });

    it('merges pending with server echo by matching serverId to existing id', () => {
      const pending = baseMobile({
        id: 'srv_1', // id matches server's serverId
        clientMessageId: 'client_xyz',
        content: 'world',
        status: 'SENDING',
        sendTime: '2024-06-01T10:00:00.000Z',
      });
      const serverEcho = baseMobile({
        id: 'srv_1',
        serverId: 'srv_1',
        clientMessageId: 'client_xyz',
        content: 'world',
        status: 'DELIVERED',
        sendTime: '2024-06-01T10:00:01.000Z',
      });

      const result = applyMobileMessageToList([pending], serverEcho);

      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('client_xyz');
    });

    it('preserves clientMessageId through merge for pending cleanup', () => {
      const pending = baseMobile({
        id: 'local_2',
        clientMessageId: 'client_qwe',
        content: 'test',
        status: 'SENDING',
      });
      const serverEcho = baseMobile({
        id: 'srv_2',
        serverId: 'srv_2',
        clientMessageId: 'client_qwe',
        content: 'test',
        status: 'SENT',
      });

      const result = applyMobileMessageToList([pending], serverEcho);

      expect(result).toHaveLength(1);
      expect(result[0].clientMessageId).toBe('client_qwe');
      expect(result[0].id).toBeDefined();
    });

    it('sorts multiple messages by sendTime after merge', () => {
      const msg1 = baseMobile({ id: 'msg_1', messageId: 'msg_1', sendTime: '2024-06-01T10:00:00.000Z' });
      const msg2 = baseMobile({ id: 'msg_2', messageId: 'msg_2', sendTime: '2024-06-01T10:00:02.000Z' });
      const incoming = baseMobile({ id: 'msg_3', messageId: 'msg_3', sendTime: '2024-06-01T10:00:01.000Z' });

      const result = applyMobileMessageToList([msg1, msg2], incoming);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('msg_1');
      expect(result[1].id).toBe('msg_3');
      expect(result[2].id).toBe('msg_2');
    });
  });
});
