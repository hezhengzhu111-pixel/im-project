/**
 * SQLite schema migrations for mobile local storage.
 *
 * Version strategy:
 * - BASE_SCHEMA_VERSION (1): the initial CREATE_SCHEMA_SQL that creates all tables from scratch.
 * - MIGRATIONS: incremental SQL statements keyed by target version number.
 * - CURRENT_DB_VERSION: the highest version the code supports.
 *
 * When adding a new migration:
 *   1. Add a new entry to MIGRATIONS with the next version number.
 *   2. Each entry is an array of SQL strings executed sequentially within a transaction.
 *   3. Update CURRENT_DB_VERSION to match the new highest key.
 *   4. Never modify existing migration entries — append only.
 */

/** The version that CREATE_SCHEMA_SQL produces (fresh install). */
export const BASE_SCHEMA_VERSION = 1;

/** The highest version this code can migrate to. Bump when adding MIGRATIONS entries. */
export const CURRENT_DB_VERSION = 3;

/**
 * Full schema SQL for fresh installs. Creates all tables and indexes.
 * This is the baseline at version 1.
 */
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
    clientMessageId TEXT,
    status TEXT NOT NULL,
    retryCount INTEGER NOT NULL DEFAULT 0,
    lastError TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    nextRetryAt INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_pending_status
    ON mobile_pending_messages(status, nextRetryAt)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_pending_client_message_id
    ON mobile_pending_messages(clientMessageId)`,
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
    updatedAt INTEGER NOT NULL,
    nextRetryAt INTEGER,
    maxRetryCount INTEGER,
    checksum TEXT,
    remoteFileId TEXT,
    lastAttemptAt INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_upload_tasks_status_retry
    ON mobile_upload_tasks(status, nextRetryAt)`,
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

/**
 * Incremental migrations keyed by target version.
 *
 * Example (for future V2):
 *   2: ['ALTER TABLE mobile_messages ADD COLUMN editedAt INTEGER']
 *
 * Each array is executed inside a single transaction.
 */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    'ALTER TABLE mobile_pending_messages ADD COLUMN clientMessageId TEXT',
    'CREATE INDEX IF NOT EXISTS idx_mobile_pending_client_message_id ON mobile_pending_messages(clientMessageId)',
  ],
  3: [
    'ALTER TABLE mobile_upload_tasks ADD COLUMN nextRetryAt INTEGER',
    'ALTER TABLE mobile_upload_tasks ADD COLUMN maxRetryCount INTEGER',
    'ALTER TABLE mobile_upload_tasks ADD COLUMN checksum TEXT',
    'ALTER TABLE mobile_upload_tasks ADD COLUMN remoteFileId TEXT',
    'ALTER TABLE mobile_upload_tasks ADD COLUMN lastAttemptAt INTEGER',
    'CREATE INDEX IF NOT EXISTS idx_mobile_upload_tasks_status_retry ON mobile_upload_tasks(status, nextRetryAt)',
  ],
};

/**
 * Returns the ordered list of migration steps needed to go from `fromVersion` to `toVersion`.
 *
 * - If fromVersion === toVersion, returns [] (already up to date).
 * - If fromVersion > toVersion, returns [] (downgrade not supported).
 * - Otherwise returns an array of { version, statements } in ascending version order.
 */
export function getMigrationSteps(
  fromVersion: number,
  toVersion: number,
): Array<{ version: number; statements: string[] }> {
  if (fromVersion >= toVersion) {
    return [];
  }
  const steps: Array<{ version: number; statements: string[] }> = [];
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const statements = MIGRATIONS[v];
    if (statements && statements.length > 0) {
      steps.push({ version: v, statements });
    }
  }
  return steps;
}
