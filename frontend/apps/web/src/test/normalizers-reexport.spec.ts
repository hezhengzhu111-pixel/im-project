/**
 * Verifies that Web normalizer re-exports from @/normalizers/* are the same
 * function references as @im/shared-normalizers — no re-implementation.
 */
import { describe, it, expect } from 'vitest';

// ─── message ────────────────────────────────────────────────────────────────
import {
  normalizeMessage as webNormalizeMessage,
  normalizeMessageConfig as webNormalizeMessageConfig,
  normalizeReadReceipt as webNormalizeReadReceipt,
  normalizeMessageType as webNormalizeMessageType,
  normalizeMessageStatus as webNormalizeMessageStatus,
  normalizeMessageSendTime as webNormalizeMessageSendTime,
  splitTextByCodePoints as webSplitTextByCodePoints,
  normalizeMediaMetadata as webNormalizeMediaMetadata,
} from '@/normalizers/message';
import {
  normalizeMessage as sharedNormalizeMessage,
  normalizeMessageConfig as sharedNormalizeMessageConfig,
  normalizeReadReceipt as sharedNormalizeReadReceipt,
  normalizeMessageType as sharedNormalizeMessageType,
  normalizeMessageStatus as sharedNormalizeMessageStatus,
  normalizeMessageSendTime as sharedNormalizeMessageSendTime,
  splitTextByCodePoints as sharedSplitTextByCodePoints,
  normalizeMediaMetadata as sharedNormalizeMediaMetadata,
} from '@im/shared-normalizers';

// ─── chat ───────────────────────────────────────────────────────────────────
import {
  normalizeConversation as webNormalizeConversation,
} from '@/normalizers/chat';
import {
  normalizeConversation as sharedNormalizeConversation,
} from '@im/shared-normalizers';

// ─── user ───────────────────────────────────────────────────────────────────
import {
  normalizeUser as webNormalizeUser,
  normalizeFriendship as webNormalizeFriendship,
  normalizeFriendRequest as webNormalizeFriendRequest,
  normalizeUserAuthResponse as webNormalizeUserAuthResponse,
  defaultUserSettings as webDefaultUserSettings,
  normalizeUserSettings as webNormalizeUserSettings,
} from '@/normalizers/user';
import {
  normalizeUser as sharedNormalizeUser,
  normalizeFriendship as sharedNormalizeFriendship,
  normalizeFriendRequest as sharedNormalizeFriendRequest,
  normalizeUserAuthResponse as sharedNormalizeUserAuthResponse,
  defaultUserSettings as sharedDefaultUserSettings,
  normalizeUserSettings as sharedNormalizeUserSettings,
} from '@im/shared-normalizers';

// ─── group ──────────────────────────────────────────────────────────────────
import {
  normalizeGroup as webNormalizeGroup,
  normalizeGroupMember as webNormalizeGroupMember,
} from '@/normalizers/group';
import {
  normalizeGroup as sharedNormalizeGroup,
  normalizeGroupMember as sharedNormalizeGroupMember,
} from '@im/shared-normalizers';

// ─── friendRequest ──────────────────────────────────────────────────────────
import {
  extractFriendRequestList as webExtractFriendRequestList,
} from '@/normalizers/friendRequest';
import {
  extractFriendRequestList as sharedExtractFriendRequestList,
} from '@im/shared-normalizers';

// ─── moments ────────────────────────────────────────────────────────────────
import {
  normalizePostWithDetails as webNormalizePostWithDetails,
  normalizePostWithDetailsList as webNormalizePostWithDetailsList,
} from '@/normalizers/moments';
import {
  normalizePostWithDetails as sharedNormalizePostWithDetails,
  normalizePostWithDetailsList as sharedNormalizePostWithDetailsList,
} from '@im/shared-normalizers';

describe('Web normalizer re-exports are identical to @im/shared-normalizers', () => {
  describe('message normalizers', () => {
    it('normalizeMessage is the same reference', () => {
      expect(webNormalizeMessage).toBe(sharedNormalizeMessage);
    });

    it('normalizeMessageConfig is the same reference', () => {
      expect(webNormalizeMessageConfig).toBe(sharedNormalizeMessageConfig);
    });

    it('normalizeReadReceipt is the same reference', () => {
      expect(webNormalizeReadReceipt).toBe(sharedNormalizeReadReceipt);
    });

    it('normalizeMessageType is the same reference', () => {
      expect(webNormalizeMessageType).toBe(sharedNormalizeMessageType);
    });

    it('normalizeMessageStatus is the same reference', () => {
      expect(webNormalizeMessageStatus).toBe(sharedNormalizeMessageStatus);
    });

    it('normalizeMessageSendTime is the same reference', () => {
      expect(webNormalizeMessageSendTime).toBe(sharedNormalizeMessageSendTime);
    });

    it('splitTextByCodePoints is the same reference', () => {
      expect(webSplitTextByCodePoints).toBe(sharedSplitTextByCodePoints);
    });

    it('normalizeMediaMetadata is the same reference', () => {
      expect(webNormalizeMediaMetadata).toBe(sharedNormalizeMediaMetadata);
    });
  });

  describe('chat normalizers', () => {
    it('normalizeConversation is the same reference', () => {
      expect(webNormalizeConversation).toBe(sharedNormalizeConversation);
    });
  });

  describe('user normalizers', () => {
    it('normalizeUser is the same reference', () => {
      expect(webNormalizeUser).toBe(sharedNormalizeUser);
    });

    it('normalizeFriendship is the same reference', () => {
      expect(webNormalizeFriendship).toBe(sharedNormalizeFriendship);
    });

    it('normalizeFriendRequest is the same reference', () => {
      expect(webNormalizeFriendRequest).toBe(sharedNormalizeFriendRequest);
    });

    it('normalizeUserAuthResponse is the same reference', () => {
      expect(webNormalizeUserAuthResponse).toBe(sharedNormalizeUserAuthResponse);
    });

    it('defaultUserSettings is the same reference', () => {
      expect(webDefaultUserSettings).toBe(sharedDefaultUserSettings);
    });

    it('normalizeUserSettings is the same reference', () => {
      expect(webNormalizeUserSettings).toBe(sharedNormalizeUserSettings);
    });
  });

  describe('group normalizers', () => {
    it('normalizeGroup is the same reference', () => {
      expect(webNormalizeGroup).toBe(sharedNormalizeGroup);
    });

    it('normalizeGroupMember is the same reference', () => {
      expect(webNormalizeGroupMember).toBe(sharedNormalizeGroupMember);
    });
  });

  describe('friendRequest normalizers', () => {
    it('extractFriendRequestList is the same reference', () => {
      expect(webExtractFriendRequestList).toBe(sharedExtractFriendRequestList);
    });
  });

  describe('moments normalizers', () => {
    it('normalizePostWithDetails is the same reference', () => {
      expect(webNormalizePostWithDetails).toBe(sharedNormalizePostWithDetails);
    });

    it('normalizePostWithDetailsList is the same reference', () => {
      expect(webNormalizePostWithDetailsList).toBe(sharedNormalizePostWithDetailsList);
    });
  });
});

describe('Web normalizers produce identical output for sample inputs', () => {
  it('normalizeMessage produces same result from both paths', () => {
    const raw = {
      id: '100',
      senderId: 'u1',
      messageType: 'TEXT',
      content: 'hello',
      status: 1,
      sendTime: '2024-06-01T10:00:00.000Z',
    };
    expect(webNormalizeMessage(raw)).toEqual(sharedNormalizeMessage(raw));
  });

  it('normalizeConversation produces same result from both paths', () => {
    const raw = {
      conversationId: '100_200',
      targetId: '200',
      conversationType: 'PRIVATE',
      lastMessageTime: '2024-06-01T10:00:00.000Z',
    };
    expect(webNormalizeConversation(raw, '100')).toEqual(sharedNormalizeConversation(raw, '100'));
  });

  it('normalizeUser produces same result from both paths', () => {
    const raw = { id: 'u1', username: 'alice', nickname: 'Alice' };
    expect(webNormalizeUser(raw)).toEqual(sharedNormalizeUser(raw));
  });

  it('normalizeGroup produces same result from both paths', () => {
    const raw = { id: 'g1', groupName: 'Team', ownerId: 'u1' };
    expect(webNormalizeGroup(raw)).toEqual(sharedNormalizeGroup(raw));
  });
});
