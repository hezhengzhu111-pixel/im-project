/**
 * 用户相关类型定义
 *
 * 已迁移至 @im/shared-types，此处仅为 re-export 以保持向后兼容。
 */

// 来自 shared-types/user.ts
export type {
  UserPresence,
  FriendRequestStatus,
  User,
  AuthSession,
  LoginRequest,
  LoginForm,
  RegisterRequest,
  RegisterForm,
  RawUserDTO,
  UserAuthResponse,
  UpdateUserRequest,
  Friendship,
  Friend,
  FriendRequest,
  AddFriendRequest,
  HandleFriendRequestRequest,
  PrivacySettings,
  MessagePreferenceSettings,
  GeneralSettings,
  NotificationSettings,
  UserSettings,
  ChangePasswordRequest,
  BindPhoneRequest,
  BindEmailRequest,
  DeleteAccountRequest,
} from '@im/shared-types';

// 来自 shared-types/auth.ts
export type {
  TokenParseResultDTO,
  TokenPairDTO,
  WsTicketDTO,
} from '@im/shared-types';
