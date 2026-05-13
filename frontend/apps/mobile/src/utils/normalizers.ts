export { asBoolean, asNumber, asString, isRecord } from '@im/shared-types';
export {
  normalizeAiKey,
  normalizeAuthResponse,
  normalizeFriendRequest,
  normalizeFriendship,
  normalizeGroup,
  normalizeGroupMember,
  normalizeSettings,
  normalizeUser,
} from '@/adapters/modelAdapter';
export { normalizeMobileMessage as normalizeMessage } from '@/adapters/messageAdapter';
export { normalizeMobileSession as normalizeSession } from '@/adapters/sessionAdapter';
