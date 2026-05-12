/**
 * 类型守卫与类型工具函数
 *
 * 已迁移至 @im/shared-types，此处仅为 re-export 以保持向后兼容。
 */

export {
  isRecord,
  asString,
  asNumber,
  asBoolean,
  isRawMessage,
  isMessage,
  isRawUser,
  isUser,
  isApiResponse,
  isFriendship,
  isFriendRequest,
  isRawGroup,
  isGroup,
  isRawGroupMember,
  isGroupMember,
  isRawConversation,
  isChatSession,
  isUserSettings,
} from '@im/shared-types';

export type {
  PartialBy,
  RequiredBy,
  DeepPartial,
  NonNullable,
  Parameters,
  ReturnType,
} from '@im/shared-types';
