import type { Message } from "@/types/message";

type StoredMessage = Message & {
  conversationId: string;
  _localId?: string;
  _cachedAt: number;
  _serverId?: string;
  _createdAtMs?: number;
};

const DB_NAME = "im_message_repo";
const DB_VERSION = 1;
const STORE_MESSAGES = "messages";

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
  const {
    conversationId: _conversationId,
    _cachedAt: _cachedAt,
    _createdAtMs: _createdAtMs,
    _localId: _localId,
    _serverId: _serverId,
    ...message
  } = record;
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
          ...message,
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
          ...message,
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
      ...message,
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
    conversationId: string,
    localId: string,
  ): Promise<void> {
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
      tx.objectStore(STORE_MESSAGES).delete(buildLocalKey(conversationId, localId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  },

  async listConversation(conversationId: string): Promise<Message[]> {
    if (!hasIndexedDb()) {
      return getMemoryConversation(conversationId).map(stripStoredMessage);
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
        const request = index.getAll(range);
        request.onsuccess = () =>
          resolve((request.result || []) as Array<StoredMessage & { key: string }>);
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
};
