import type {Ref} from "vue";
import type {Message, MessageSearchResult} from "@/types";

type MessageSearchModuleContext = {
  messages: Ref<Map<string, Message[]>>;
  searchResults: Ref<MessageSearchResult[]>;
};

type SearchIndexEntry = {
  index: number;
  message: Message;
  searchableText: string;
};

export function createMessageSearchModule(ctx: MessageSearchModuleContext) {
  const searchIndexCache = new WeakMap<Message[], SearchIndexEntry[]>();
  const resultCache = new WeakMap<Message[], Map<string, MessageSearchResult[]>>();

  const buildSearchIndex = (list: Message[]): SearchIndexEntry[] => {
    const cached = searchIndexCache.get(list);
    if (cached) {
      return cached;
    }
    const built = list.map((message, index) => ({
      index,
      message,
      searchableText: String(message.content || "").toLowerCase(),
    }));
    searchIndexCache.set(list, built);
    return built;
  };

  const searchInSession = (list: Message[], keyword: string): MessageSearchResult[] => {
    const perListCache = resultCache.get(list) || new Map<string, MessageSearchResult[]>();
    if (perListCache.has(keyword)) {
      return perListCache.get(keyword) || [];
    }

    const results = buildSearchIndex(list)
      .filter((entry) => entry.searchableText.includes(keyword))
      .map((entry) => ({
        message: entry.message,
        highlight: keyword,
        context: list.slice(Math.max(0, entry.index - 1), Math.min(list.length, entry.index + 2)),
      }));

    perListCache.set(keyword, results);
    resultCache.set(list, perListCache);
    return results;
  };

  const searchMessages = async (keyword: string, sessionId?: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      ctx.searchResults.value = [];
      return;
    }

    const sessionIds = sessionId ? [sessionId] : Array.from(ctx.messages.value.keys());
    const nextResults: MessageSearchResult[] = [];
    sessionIds.forEach((id) => {
      const list = ctx.messages.value.get(id) || [];
      if (list.length === 0) {
        return;
      }
      nextResults.push(...searchInSession(list, normalizedKeyword));
    });

    ctx.searchResults.value = nextResults;
  };

  return {
    searchMessages,
  };
}
