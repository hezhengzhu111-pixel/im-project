export const DB_VERSION = 1;

export const CREATE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS mobile_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    targetId TEXT NOT NULL,
    targetName TEXT NOT NULL,
    targetAvatar TEXT,
    unreadCount INTEGER NOT NULL DEFAULT 0,
    lastActiveTime TEXT,
    lastMessageJson TEXT,
    isPinned INTEGER NOT NULL DEFAULT 0,
    isMuted INTEGER NOT NULL DEFAULT 0,
    encrypted INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_messages (
    id TEXT PRIMARY KEY NOT NULL,
    serverId TEXT,
    clientMessageId TEXT,
    conversationId TEXT NOT NULL,
    senderId TEXT NOT NULL,
    receiverId TEXT,
    groupId TEXT,
    messageType TEXT NOT NULL,
    content TEXT,
    mediaUrl TEXT,
    thumbnailUrl TEXT,
    mediaName TEXT,
    mediaSize INTEGER,
    duration INTEGER,
    status TEXT,
    readStatus INTEGER,
    readByCount INTEGER,
    sendTime TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    rawJson TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_messages_server
    ON mobile_messages(conversationId, serverId) WHERE serverId IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_messages_client
    ON mobile_messages(conversationId, clientMessageId) WHERE clientMessageId IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_messages_conversation_time
    ON mobile_messages(conversationId, sendTime)`,
  `CREATE TABLE IF NOT EXISTS mobile_pending_messages (
    localId TEXT PRIMARY KEY NOT NULL,
    conversationId TEXT NOT NULL,
    sendType TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    status TEXT NOT NULL,
    retryCount INTEGER NOT NULL DEFAULT 0,
    lastError TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    nextRetryAt INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_pending_status
    ON mobile_pending_messages(status, nextRetryAt)`,
  `CREATE TABLE IF NOT EXISTS mobile_upload_tasks (
    taskId TEXT PRIMARY KEY NOT NULL,
    conversationId TEXT,
    localMessageId TEXT,
    fileUri TEXT NOT NULL,
    fileName TEXT NOT NULL,
    mimeType TEXT,
    fileSize INTEGER,
    uploadType TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    retryCount INTEGER NOT NULL DEFAULT 0,
    remoteUrl TEXT,
    lastError TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_media_cache (
    cacheKey TEXT PRIMARY KEY NOT NULL,
    remoteUrl TEXT NOT NULL,
    localPath TEXT,
    mimeType TEXT,
    size INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_notification_events (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    routeName TEXT,
    payloadJson TEXT,
    createdAt INTEGER NOT NULL
  )`,
];
