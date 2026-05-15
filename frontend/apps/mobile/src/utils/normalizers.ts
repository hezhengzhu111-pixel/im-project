export { asBoolean, asNumber, asString, isRecord } from '@im/shared-types';
export {
  normalizeAiKey,
  normalizeAiSettings,
  normalizeAuthResponse,
  normalizeFriendRequest,
  normalizeFriendship,
  normalizeGroup,
  normalizeGroupMember,
  normalizeSettings,
  normalizeUser,
} from '@/adapters/modelAdapter';
export {
  normalizeMobileMessage as normalizeMessage,
  hasSameMobileMessageIdentity,
  applyMobileMessageToList,
  toSharedMessage,
} from '@/adapters/messageAdapter';
export {
  normalizeMobileSession as normalizeSession,
  resolvePrivateSessionId,
  resolveGroupSessionId,
  resolveMessageSessionId,
  createSessionFromMessage,
} from '@/adapters/sessionAdapter';
