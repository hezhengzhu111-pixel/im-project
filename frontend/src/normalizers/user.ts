import type {
  FriendRequest,
  FriendRequestStatus,
  Friendship,
  RawUserDTO,
  User,
  UserAuthResponse,
  UserPresence,
  UserSettings,
} from "@/types";
import {
  asBoolean,
  asNumber,
  asString,
  isRawUser,
  isRecord,
} from "@/types/utils";

const normalizePresence = (value: unknown): UserPresence => {
  const normalized = asString(value).toLowerCase();
  if (normalized === "online") return "online";
  if (normalized === "busy") return "busy";
  if (normalized === "away") return "away";
  return "offline";
};

const normalizeFriendRequestStatus = (value: unknown): FriendRequestStatus => {
  const normalized = asString(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "1" || normalized === "已同意") {
    return "ACCEPTED";
  }
  if (normalized === "REJECTED" || normalized === "2" || normalized === "已拒绝") {
    return "REJECTED";
  }
  return "PENDING";
};

export const normalizeUser = (raw: RawUserDTO | User): User => {
  const record = isRawUser(raw) ? raw : {};
  return {
    id: asString(record.id ?? record.userId),
    username: asString(record.username),
    nickname: asString(record.nickname, asString(record.username)),
    avatar: asString(record.avatar) || undefined,
    email: asString(record.email) || undefined,
    phone: asString(record.phone) || undefined,
    gender: asString(record.gender) || undefined,
    birthday: asString(record.birthday) || undefined,
    signature: asString(record.signature) || undefined,
    location: asString(record.location) || undefined,
    lastSeen: asString(record.lastSeen) || undefined,
    status: normalizePresence(record.status),
    lastLoginTime: asString(record.lastLoginTime) || undefined,
    createTime: asString(record.createTime) || undefined,
  };
};

export const normalizeFriendship = (raw: unknown): Friendship => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id ?? record.friendId),
    friendId: asString(record.friendId ?? record.userId ?? record.id),
    username: asString(record.username),
    nickname: asString(record.nickname) || undefined,
    avatar: asString(record.avatar) || undefined,
    remark: asString(record.remark) || undefined,
    isOnline: typeof record.isOnline === "boolean" ? record.isOnline : undefined,
    lastActiveTime: asString(record.lastActiveTime) || undefined,
    createdAt: asString(record.createdAt) || undefined,
    createTime: asString(record.createTime) || undefined,
    signature: asString(record.signature) || undefined,
    lastSeen: asString(record.lastSeen) || undefined,
  };
};

export const normalizeFriendRequest = (raw: unknown): FriendRequest => {
  const record = isRecord(raw) ? raw : {};
  const fromUser = isRecord(record.fromUser) ? record.fromUser : {};
  return {
    id: asString(record.id),
    applicantId: asString(record.applicantId ?? record.fromUserId ?? record.senderId),
    applicantUsername: asString(
      record.applicantUsername ?? fromUser.username ?? record.username,
    ),
    applicantNickname: asString(
      record.applicantNickname ?? fromUser.nickname ?? record.nickname,
    ) || undefined,
    applicantAvatar: asString(record.applicantAvatar ?? fromUser.avatar ?? record.avatar) || undefined,
    targetUserId: asString(record.targetUserId ?? record.receiverId) || undefined,
    targetUsername: asString(record.targetUsername) || undefined,
    targetNickname: asString(record.targetNickname) || undefined,
    targetAvatar: asString(record.targetAvatar) || undefined,
    reason: asString(record.reason ?? record.message) || undefined,
    status: normalizeFriendRequestStatus(record.status),
    createTime: asString(record.createTime),
    updateTime: asString(record.updateTime) || undefined,
  };
};

export const normalizeUserAuthResponse = (raw: unknown): UserAuthResponse => {
  const record = isRecord(raw) ? raw : {};
  const rawPermissions = Array.isArray(record.permissions)
    ? record.permissions
    : Array.isArray(record.resourcePermissions)
      ? record.resourcePermissions
      : [];
  return {
    success: asBoolean(record.success, false),
    message: asString(record.message, "操作失败"),
    user: normalizeUser(record.user as RawUserDTO),
    token: asString(record.token) || undefined,
    expiresInMs: Number.isFinite(asNumber(record.expiresInMs, Number.NaN))
      ? asNumber(record.expiresInMs, 0)
      : undefined,
    refreshExpiresInMs: Number.isFinite(
      asNumber(record.refreshExpiresInMs, Number.NaN),
    )
      ? asNumber(record.refreshExpiresInMs, 0)
      : undefined,
    permissions: rawPermissions.map((item) => asString(item)).filter(Boolean),
  };
};

export const defaultUserSettings = (): UserSettings => ({
  general: {
    language: "zh-CN",
    theme: "light",
    fontSize: "medium",
    autoLogin: true,
    minimizeOnStart: false,
  },
  privacy: {
    allowStrangerAdd: true,
    showOnlineStatus: true,
    allowViewMoments: true,
    messageReadReceipt: true,
  },
  message: {
    enableNotification: true,
    enableSound: true,
    enableVibration: false,
    muteGroupMessages: false,
    autoDownloadImages: true,
  },
  notifications: {
    sound: true,
    desktop: true,
    preview: true,
  },
});

export const normalizeUserSettings = (raw: unknown): UserSettings => {
  const defaults = defaultUserSettings();
  const record = isRecord(raw) ? raw : {};
  const general = isRecord(record.general) ? record.general : {};
  const privacy = isRecord(record.privacy) ? record.privacy : {};
  const message = isRecord(record.message) ? record.message : {};
  const notifications = isRecord(record.notifications)
    ? record.notifications
    : {};

  return {
    general: {
      language:
        asString(general.language) === "en-US" ? "en-US" : defaults.general.language,
      theme:
        asString(general.theme) === "dark"
          ? "dark"
          : asString(general.theme) === "auto"
            ? "auto"
            : defaults.general.theme,
      fontSize:
        asString(general.fontSize) === "small"
          ? "small"
          : asString(general.fontSize) === "large"
            ? "large"
            : defaults.general.fontSize,
      autoLogin: asBoolean(general.autoLogin, defaults.general.autoLogin),
      minimizeOnStart: asBoolean(
        general.minimizeOnStart,
        defaults.general.minimizeOnStart,
      ),
    },
    privacy: {
      allowStrangerAdd: asBoolean(
        privacy.allowStrangerAdd ?? privacy.allowSearchByPhone,
        defaults.privacy.allowStrangerAdd,
      ),
      showOnlineStatus: asBoolean(
        privacy.showOnlineStatus,
        defaults.privacy.showOnlineStatus,
      ),
      allowViewMoments: asBoolean(
        privacy.allowViewMoments,
        defaults.privacy.allowViewMoments,
      ),
      messageReadReceipt: asBoolean(
        privacy.messageReadReceipt,
        defaults.privacy.messageReadReceipt,
      ),
    },
    message: {
      enableNotification: asBoolean(
        message.enableNotification ?? notifications.desktop,
        defaults.message.enableNotification,
      ),
      enableSound: asBoolean(
        message.enableSound ?? notifications.sound,
        defaults.message.enableSound,
      ),
      enableVibration: asBoolean(
        message.enableVibration,
        defaults.message.enableVibration,
      ),
      muteGroupMessages: asBoolean(
        message.muteGroupMessages,
        defaults.message.muteGroupMessages,
      ),
      autoDownloadImages: asBoolean(
        message.autoDownloadImages,
        defaults.message.autoDownloadImages,
      ),
    },
    notifications: {
      sound: asBoolean(notifications.sound, defaults.notifications.sound),
      desktop: asBoolean(notifications.desktop, defaults.notifications.desktop),
      preview: asBoolean(notifications.preview, defaults.notifications.preview),
    },
  };
};
