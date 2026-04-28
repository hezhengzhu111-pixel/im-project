export type UserPresence = "online" | "offline" | "busy" | "away";

export type FriendRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  signature?: string;
  location?: string;
  lastSeen?: string;
  status: UserPresence;
  lastLoginTime?: string;
  createTime?: string;
}

export interface AuthSession {
  currentUser: User | null;
  isAuthenticated: boolean;
  authReady: boolean;
  permissions?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginForm extends LoginRequest {
  rememberMe?: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  email?: string;
  phone?: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
  nickname?: string;
  phone?: string;
}

export interface RawUserDTO {
  id?: string | number;
  userId?: string | number;
  username?: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  signature?: string;
  location?: string;
  status?: string | number;
  lastSeen?: string;
  lastLoginTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface UserAuthResponse {
  success: boolean;
  message: string;
  user: User;
  token?: string;
  expiresInMs?: number;
  refreshExpiresInMs?: number;
  permissions?: string[];
}

export interface TokenPairDTO {
  accessToken?: string;
  refreshToken?: string;
  expiresInMs: number;
  refreshExpiresInMs: number;
}

export interface WsTicketDTO {
  ticket: string;
  expiresInMs: number;
}

export interface TokenParseResultDTO {
  valid: boolean;
  expired: boolean;
  error?: string;
  userId?: string | number;
  username?: string;
  issuedAtEpochMs?: number;
  expiresAtEpochMs?: number;
  jti?: string;
  tokenType?: string;
  permissions?: string[];
}

export type UpdateUserRequest = Partial<
  Pick<
    User,
    "nickname" | "avatar" | "email" | "phone" | "gender" | "birthday" | "signature" | "location"
  >
>;

export interface Friendship {
  id: string;
  friendId: string;
  username: string;
  nickname?: string;
  avatar?: string;
  remark?: string;
  isOnline?: boolean;
  lastActiveTime?: string;
  createdAt?: string;
  createTime?: string;
  signature?: string;
  lastSeen?: string;
}

export type Friend = Friendship;

export interface FriendRequest {
  id: string;
  applicantId: string;
  applicantUsername: string;
  applicantNickname?: string;
  applicantAvatar?: string;
  targetUserId?: string;
  targetUsername?: string;
  targetNickname?: string;
  targetAvatar?: string;
  reason?: string;
  status: FriendRequestStatus;
  createTime: string;
  updateTime?: string;
}

export interface AddFriendRequest {
  userId: string;
  message?: string;
}

export interface HandleFriendRequestRequest {
  requestId: string;
  action: "ACCEPT" | "REJECT";
}

export interface PrivacySettings {
  allowStrangerAdd: boolean;
  showOnlineStatus: boolean;
  allowViewMoments: boolean;
  messageReadReceipt: boolean;
}

export interface MessagePreferenceSettings {
  enableNotification: boolean;
  enableSound: boolean;
  enableVibration: boolean;
  muteGroupMessages: boolean;
  autoDownloadImages: boolean;
}

export interface GeneralSettings {
  language: "zh-CN" | "en-US";
  theme: "light" | "dark" | "auto";
  fontSize: "small" | "medium" | "large";
  autoLogin: boolean;
  minimizeOnStart: boolean;
}

export interface NotificationSettings {
  sound: boolean;
  desktop: boolean;
  preview: boolean;
}

export interface UserSettings {
  general: GeneralSettings;
  privacy: PrivacySettings;
  message: MessagePreferenceSettings;
  notifications: NotificationSettings;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface BindPhoneRequest {
  phone: string;
  code: string;
}

export interface BindEmailRequest {
  email: string;
  code: string;
}

export interface DeleteAccountRequest {
  password: string;
}
