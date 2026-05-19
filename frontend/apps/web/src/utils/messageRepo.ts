import type { Message } from "@/types/message";

type StoredMessage = Message & {
  conversationId: string;
  _localId?: string;
  _cachedAt: number;
  _serverId?: string;
  _createdAtMs?: number;
};

/**
 * IndexedDB 结构化克隆兼容处理。
 * - 解密成功 / 自己的消息：保留 content + e2eeEnvelope（JSON-roundtrip）
 * - 解密失败：content 为空，保留 e2eeEnvelope（刷新后重试）
 *
 * Double Ratchet 防重放：已解密的旧消息不可再次 decrypt，成功解密后必须持久化 content。
 */
const sanitizeForIDB = (message: Message): Message => {
  if (!message.encrypted || !message.e2eeEnvelope) {
    return message;
  }
  const cleaned = { ...message };
  let changed = false;
  // 仅解密失败的消息不存 content
  if (message.decryptStatus === "failed" && cleaned.content) {
    cleaned.content = "";
    changed = true;
  }
  // JSON-roundtrip 确保 e2eeEnvelope 是纯 JSON 对象
  if (cleaned.e2eeEnvelope !== undefined) {
    cleaned.e2eeEnvelope = JSON.parse(JSON.stringify(cleaned.e2eeEnvelope));
    changed = true;
  }
  if (cleaned.extra?.e2eeEnvelope !== undefined) {
    cleaned.extra = { ...cleaned.extra, e2eeEnvelope: JSON.parse(JSON.stringify(cleaned.extra.e2eeEnvelope)) };
    changed = true;
  }
  return changed ? cleaned : message;
};

const DB_NAME = "im_message_repo";
const DB_VERSION = 2;
const STORE_MESSAGES = "messages";
const STORE_PENDING = "pending_messages";

const memoryConversationCache = new Map<string, StoredMessage[]>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function toCreatedAtMs(message: Message): number | undefined {
  const raw = message.sendTime;
  if (!raw) {
    return undefined;
  }
  const normalized =
    typeof raw === "string"
      ? raw.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
          "$1.$2",
        )
      : raw;
  const milliseconds = new Date(normalized).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "key" });
        store.createIndex("byConversation", "conversationId", {
          unique: false,
        });
        store.createIndex(
          "byConversationCreatedAt",
          ["conversationId", "_createdAtMs"],
          { unique: false },
        );
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const pendingStore = db.createObjectStore(STORE_PENDING, {
          keyPath: "localId",
        });
        pendingStore.createIndex("byConversation", "conversationId");
        pendingStore.createIndex("byStatus", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildServerKey(conversationId: string, id: string): string {
  return `${conversationId}:s:${id}`;
}

function buildLocalKey(conversationId: string, localId: string): string {
  return `${conversationId}:l:${localId}`;
}

function stripStoredMessage(record: StoredMessage): Message {
  const message: Message = { ...record };
  const storedFields = message as Partial<StoredMessage>;
  delete storedFields.conversationId;
  delete storedFields._cachedAt;
  delete storedFields._createdAtMs;
  delete storedFields._localId;
  delete storedFields._serverId;
  return message;
}

function getMemoryConversation(conversationId: string): StoredMessage[] {
  return memoryConversationCache.get(conversationId)?.slice() || [];
}

function setMemoryConversation(
  conversationId: string,
  messages: StoredMessage[],
): void {
  memoryConversationCache.set(
    conversationId,
    messages.slice().sort((left, right) => {
      return (left._createdAtMs || 0) - (right._createdAtMs || 0);
    }),
  );
}

export const messageRepo = {
  async upsertServerMessages(
    conversationId: string,
    messages: Message[],
  ): Promise<void> {
    const now = Date.now();
    if (!hasIndexedDb()) {
      const byServerId = new Map<string, StoredMessage>();
      for (const message of getMemoryConversation(conversationId)) {
        if (message._serverId) {
          byServerId.set(message._serverId, message);
        }
      }
      for (const message of messages) {
        const serverId = String(message.id);
        byServerId.set(serverId, {
          ...sanitizeForIDB(message),
          conversationId,
          _cachedAt: now,
          _serverId: serverId,
          _createdAtMs: toCreatedAtMs(message),
        });
      }
      setMemoryConversation(conversationId, Array.from(byServerId.values()));
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_MESSAGES);
      for (const message of messages) {
        const serverId = String(message.id);
        store.put({
          key: buildServerKey(conversationId, serverId),
          conversationId,
          _cachedAt: now,
          _serverId: serverId,
          _createdAtMs: toCreatedAtMs(message),
          ...sanitizeForIDB(message),
        } as StoredMessage & { key: string });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  },

  async upsertPendingMessage(
    conversationId: string,
    localId: string,
    message: Message,
  ): Promise<void> {
    const now = Date.now();
    const record: StoredMessage = {
      ...sanitizeForIDB(message),
      conversationId,
      _localId: localId,
      _cachedAt: now,
      _createdAtMs: toCreatedAtMs(message) ?? now,
    };

    if (!hasIndexedDb()) {
      const existing = getMemoryConversation(conversationId).filter(
        (item) => item._localId !== localId,
      );
      existing.push(record);
      setMemoryConversation(conversationId, existing);
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      tx.objectStore(STORE_MESSAGES).put({
        key: buildLocalKey(conversationId, localId),
        ...record,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  },

  async removePendingMessage(
    conversationIdOrLocalId: string,
    maybeLocalId?: string,
  ): Promise<void> {
    if (maybeLocalId !== undefined) {
      // Existing behavior: remove from messages store by conversationId + localId
      const conversationId = conversationIdOrLocalId;
      const localId = maybeLocalId;
      if (!hasIndexedDb()) {
        setMemoryConversation(
          conversationId,
          getMemoryConversation(conversationId).filter(
            (item) => item._localId !== localId,
          ),
        );
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_MESSAGES, "readwrite");
        tx.objectStore(STORE_MESSAGES).delete(
          buildLocalKey(conversationId, localId),
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    } else {
      // New behavior: remove from pending_messages store by localId
      const localId = conversationIdOrLocalId;
      if (!hasIndexedDb()) return;
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PENDING, "readwrite");
        tx.objectStore(STORE_PENDING).delete(localId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
  },

  async listConversation(
    conversationId: string,
    limit = 50,
  ): Promise<Message[]> {
    if (!hasIndexedDb()) {
      return getMemoryConversation(conversationId)
        .slice(-Math.max(1, limit))
        .map(stripStoredMessage);
    }

    const db = await openDb();
    const items = await new Promise<Array<StoredMessage & { key: string }>>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_MESSAGES, "readonly");
        const index = tx
          .objectStore(STORE_MESSAGES)
          .index("byConversationCreatedAt");
        const range = IDBKeyRange.bound(
          [conversationId, -Infinity],
          [conversationId, Infinity],
        );
        const result: Array<StoredMessage & { key: string }> = [];
        const request = index.openCursor(range, "prev");
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || result.length >= Math.max(1, limit)) {
            resolve(result.reverse());
            return;
          }
          result.push(cursor.value as StoredMessage & { key: string });
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return items.map(stripStoredMessage);
  },

  async clearConversation(conversationId: string): Promise<void> {
    if (!hasIndexedDb()) {
      memoryConversationCache.delete(conversationId);
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_MESSAGES);
      const index = store.index("byConversation");
      const range = IDBKeyRange.only(conversationId);
      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  },

  async addPendingMessage(
    conversationId: string,
    localId: string,
    payload: unknown,
  ): Promise<void> {
    if (!hasIndexedDb()) return;
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    store.put({
      localId,
      conversationId,
      payload: JSON.stringify(payload),
      status: "pending",
      createdAt: Date.now(),
      retryCount: 0,
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async listPendingMessages(
    conversationId?: string,
  ): Promise<
    Array<{ localId: string; conversationId: string; payload: string }>
  > {
    if (!hasIndexedDb()) return [];
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING, "readonly");
    const store = tx.objectStore(STORE_PENDING);

    return new Promise((resolve, reject) => {
      const results: Array<{
        localId: string;
        conversationId: string;
        payload: string;
      }> = [];
      const request = conversationId
        ? store
            .index("byConversation")
            .openCursor(IDBKeyRange.only(conversationId))
        : store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async clearPendingMessages(): Promise<void> {
    if (!hasIndexedDb()) return;
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
