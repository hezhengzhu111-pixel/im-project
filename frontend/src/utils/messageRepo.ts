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

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toCreatedAtMs(message: any): number | undefined {
  const raw =
    message?.created_at ||
    message?.createdAt ||
    message?.createdTime ||
    message?.sendTime ||
    message?.send_time;
  if (!raw) return undefined;
  const normalized =
    typeof raw === "string"
      ? raw.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})\d+$/,
          "$1.$2",
        )
      : raw;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "key" });
        store.createIndex("byConversation", "conversationId", {
          unique: false,
        });
        store.createIndex(
          "byConversationCreatedAt",
          ["conversationId", "_createdAtMs"],
          {
            unique: false,
          },
        );
        store.createIndex(
          "byConversationLocal",
          ["conversationId", "_localId"],
          { unique: false },
        );
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function buildServerKey(conversationId: string, id: string | number): string {
  return `${conversationId}:s:${String(id)}`;
}

function buildLocalKey(conversationId: string, localId: string): string {
  return `${conversationId}:l:${localId}`;
}

function localStorageKey(conversationId: string): string {
  return `im_msg_cache:${conversationId}`;
}

export const messageRepo = {
  async upsertServerMessages(
    conversationId: string,
    messages: Message[],
  ): Promise<void> {
    const now = Date.now();
    if (!hasIndexedDb()) {
      const existing = safeJsonParse<StoredMessage[]>(
        localStorage.getItem(localStorageKey(conversationId)),
        [],
      );
      const byId = new Map<string, StoredMessage>();
      for (const m of existing) {
        const sid = (m as any)._serverId;
        if (sid) byId.set(sid, m);
      }
      for (const msg of messages) {
        const sid = String(msg.id);
        byId.set(sid, {
          ...(msg as any),
          conversationId,
          _cachedAt: now,
          _serverId: sid,
          _createdAtMs: toCreatedAtMs(msg),
        });
      }
      localStorage.setItem(
        localStorageKey(conversationId),
        JSON.stringify(Array.from(byId.values())),
      );
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_MESSAGES);
      for (const msg of messages) {
        const sid = String(msg.id);
        const record: any = {
          key: buildServerKey(conversationId, msg.id),
          conversationId,
          _cachedAt: now,
          _serverId: sid,
          _createdAtMs: toCreatedAtMs(msg),
          ...msg,
        };
        store.put(record);
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
    const record: any = {
      key: buildLocalKey(conversationId, localId),
      conversationId,
      _localId: localId,
      _cachedAt: now,
      _createdAtMs: toCreatedAtMs(message) ?? now,
      ...message,
    };

    if (!hasIndexedDb()) {
      const existing = safeJsonParse<StoredMessage[]>(
        localStorage.getItem(localStorageKey(conversationId)),
        [],
      );
      const filtered = existing.filter((m) => (m as any)._localId !== localId);
      filtered.push(record);
      localStorage.setItem(
        localStorageKey(conversationId),
        JSON.stringify(filtered),
      );
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      tx.objectStore(STORE_MESSAGES).put(record);
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
      const existing = safeJsonParse<StoredMessage[]>(
        localStorage.getItem(localStorageKey(conversationId)),
        [],
      );
      const filtered = existing.filter((m) => (m as any)._localId !== localId);
      localStorage.setItem(
        localStorageKey(conversationId),
        JSON.stringify(filtered),
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
  },

  async listConversation(conversationId: string): Promise<Message[]> {
    if (!hasIndexedDb()) {
      const existing = safeJsonParse<StoredMessage[]>(
        localStorage.getItem(localStorageKey(conversationId)),
        [],
      );
      return existing
        .slice()
        .sort((a, b) => (a._createdAtMs || 0) - (b._createdAtMs || 0))
        .map((m) => {
          const {
            conversationId: _c,
            _cachedAt: _t,
            _createdAtMs: _m,
            _localId,
            _serverId,
            ...rest
          } = m as any;
          return rest as Message;
        });
    }

    const db = await openDb();
    const items = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readonly");
      const idx = tx
        .objectStore(STORE_MESSAGES)
        .index("byConversationCreatedAt");
      const range = IDBKeyRange.bound(
        [conversationId, -Infinity],
        [conversationId, Infinity],
      );
      const req = idx.getAll(range);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.map((m: any) => {
      const {
        key: _k,
        conversationId: _c,
        _cachedAt: _t,
        _createdAtMs: _m2,
        _localId,
        _serverId,
        ...rest
      } = m;
      return rest as Message;
    });
  },

  async clearConversation(conversationId: string): Promise<void> {
    if (!hasIndexedDb()) {
      localStorage.removeItem(localStorageKey(conversationId));
      return;
    }

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_MESSAGES);
      const idx = store.index("byConversation");
      const range = IDBKeyRange.only(conversationId);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
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
