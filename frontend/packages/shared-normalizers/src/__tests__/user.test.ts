import { describe, it, expect } from "vitest";
import {
  normalizeUser,
  normalizeFriendship,
  normalizeUserSettings,
  defaultUserSettings,
} from "../user.js";
import type { RawUserDTO, UserSettings } from "@im/shared-types";

describe("normalizeUser", () => {
  describe("id / userId mapping", () => {
    it("prefers id over userId", () => {
      const raw: RawUserDTO = { id: "u-1", userId: "u-2", username: "a" };
      expect(normalizeUser(raw).id).toBe("u-1");
    });

    it("falls back to userId when id is absent", () => {
      const raw: RawUserDTO = { userId: "u-99", username: "a" };
      expect(normalizeUser(raw).id).toBe("u-99");
    });

    it("converts numeric id to string", () => {
      const raw = { id: 12345, username: "a" } as unknown as RawUserDTO;
      expect(normalizeUser(raw).id).toBe("12345");
    });
  });

  describe("basic fields", () => {
    it("maps username", () => {
      expect(normalizeUser({ id: "1", username: "alice" }).username).toBe("alice");
    });

    it("nickname falls back to username when absent", () => {
      expect(normalizeUser({ id: "1", username: "bob" }).nickname).toBe("bob");
    });

    it("nickname prefers explicit value over username fallback", () => {
      expect(normalizeUser({ id: "1", username: "bob", nickname: "Bobby" }).nickname).toBe("Bobby");
    });

    it("maps avatar", () => {
      expect(normalizeUser({ id: "1", username: "a", avatar: "av.png" }).avatar).toBe("av.png");
    });

    it("avatar is undefined when empty", () => {
      expect(normalizeUser({ id: "1", username: "a", avatar: "" }).avatar).toBeUndefined();
    });

    it("maps email", () => {
      expect(normalizeUser({ id: "1", username: "a", email: "a@b.com" }).email).toBe("a@b.com");
    });

    it("email is undefined when empty", () => {
      expect(normalizeUser({ id: "1", username: "a" }).email).toBeUndefined();
    });

    it("maps phone", () => {
      expect(normalizeUser({ id: "1", username: "a", phone: "123" }).phone).toBe("123");
    });

    it("maps gender", () => {
      expect(normalizeUser({ id: "1", username: "a", gender: "male" }).gender).toBe("male");
    });

    it("maps birthday", () => {
      expect(normalizeUser({ id: "1", username: "a", birthday: "2000-01-01" }).birthday).toBe("2000-01-01");
    });

    it("maps signature", () => {
      expect(normalizeUser({ id: "1", username: "a", signature: "hello" }).signature).toBe("hello");
    });

    it("maps location", () => {
      expect(normalizeUser({ id: "1", username: "a", location: "Shanghai" }).location).toBe("Shanghai");
    });

    it("location falls back to region", () => {
      const raw = { id: "1", username: "a", region: "Beijing" } as unknown as RawUserDTO;
      expect(normalizeUser(raw).location).toBe("Beijing");
    });
  });

  describe("status normalization", () => {
    it("normalizes 'online' string", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "online" }).status).toBe("online");
    });

    it("normalizes 'ONLINE' (case-insensitive)", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "ONLINE" }).status).toBe("online");
    });

    it("normalizes 'busy'", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "busy" }).status).toBe("busy");
    });

    it("normalizes 'away'", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "away" }).status).toBe("away");
    });

    it("normalizes 'offline'", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "offline" }).status).toBe("offline");
    });

    it("falls back to 'offline' for unknown status", () => {
      expect(normalizeUser({ id: "1", username: "a", status: "invisible" }).status).toBe("offline");
    });

    it("falls back to 'offline' for numeric status", () => {
      expect(normalizeUser({ id: "1", username: "a", status: 1 as unknown as string }).status).toBe("offline");
    });
  });

  describe("time fields", () => {
    it("maps lastSeen", () => {
      expect(normalizeUser({ id: "1", username: "a", lastSeen: "2024-01-01" }).lastSeen).toBe("2024-01-01");
    });

    it("lastSeen is undefined when empty", () => {
      expect(normalizeUser({ id: "1", username: "a" }).lastSeen).toBeUndefined();
    });

    it("maps lastLoginTime", () => {
      expect(normalizeUser({ id: "1", username: "a", lastLoginTime: "2024-06-01" }).lastLoginTime).toBe("2024-06-01");
    });

    it("maps createTime", () => {
      expect(normalizeUser({ id: "1", username: "a", createTime: "2024-01-01" }).createTime).toBe("2024-01-01");
    });
  });

  describe("permissions", () => {
    it("maps permissions array", () => {
      const result = normalizeUser({ id: "1", username: "a", permissions: ["admin", "user"] });
      expect(result.permissions).toEqual(["admin", "user"]);
    });

    it("filters empty strings from permissions", () => {
      const result = normalizeUser({ id: "1", username: "a", permissions: ["admin", "", "user"] });
      expect(result.permissions).toEqual(["admin", "user"]);
    });

    it("permissions is undefined when not an array", () => {
      const result = normalizeUser({ id: "1", username: "a", permissions: "admin" as unknown as string[] });
      expect(result.permissions).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles null/undefined input gracefully", () => {
      const result = normalizeUser(null as unknown as RawUserDTO);
      expect(result.id).toBe("");
      expect(result.username).toBe("");
      expect(result.nickname).toBe("");
    });

    it("all optional fields are undefined for minimal input", () => {
      const result = normalizeUser({ id: "1", username: "a" });
      expect(result.avatar).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.gender).toBeUndefined();
      expect(result.birthday).toBeUndefined();
      expect(result.signature).toBeUndefined();
      expect(result.location).toBeUndefined();
      expect(result.lastSeen).toBeUndefined();
      expect(result.lastLoginTime).toBeUndefined();
      expect(result.createTime).toBeUndefined();
      expect(result.permissions).toBeUndefined();
    });
  });
});

describe("normalizeFriendship", () => {
  it("maps id from friendId fallback", () => {
    const raw = { friendId: "f1", username: "alice" };
    expect(normalizeFriendship(raw).id).toBe("f1");
  });

  it("prefers id over friendId", () => {
    const raw = { id: "i1", friendId: "f1", username: "alice" };
    expect(normalizeFriendship(raw).id).toBe("i1");
  });

  it("maps friendId from userId fallback", () => {
    const raw = { id: "i1", userId: "u1", username: "alice" };
    expect(normalizeFriendship(raw).friendId).toBe("u1");
  });

  it("maps isOnline boolean", () => {
    expect(normalizeFriendship({ id: "1", friendId: "1", username: "a", isOnline: true }).isOnline).toBe(true);
  });

  it("maps online alias to isOnline", () => {
    expect(normalizeFriendship({ id: "1", friendId: "1", username: "a", online: true } as Record<string, unknown>).isOnline).toBe(true);
  });

  it("isOnline is undefined when neither isOnline nor online present", () => {
    expect(normalizeFriendship({ id: "1", friendId: "1", username: "a" }).isOnline).toBeUndefined();
  });

  it("handles null input", () => {
    const result = normalizeFriendship(null);
    expect(result.id).toBe("");
    expect(result.friendId).toBe("");
  });
});

describe("defaultUserSettings", () => {
  it("returns correct defaults", () => {
    const s = defaultUserSettings();
    expect(s.general.language).toBe("zh-CN");
    expect(s.general.theme).toBe("light");
    expect(s.general.fontSize).toBe("medium");
    expect(s.general.autoLogin).toBe(true);
    expect(s.privacy.allowStrangerAdd).toBe(true);
    expect(s.privacy.showOnlineStatus).toBe(true);
    expect(s.message.enableNotification).toBe(true);
    expect(s.message.enableSound).toBe(true);
    expect(s.message.enableVibration).toBe(false);
    expect(s.notifications.sound).toBe(true);
    expect(s.notifications.desktop).toBe(true);
    expect(s.notifications.preview).toBe(true);
  });
});

describe("normalizeUserSettings", () => {
  it("returns defaults for null input", () => {
    const result = normalizeUserSettings(null);
    expect(result).toEqual(defaultUserSettings());
  });

  it("merges partial general settings with defaults", () => {
    const result = normalizeUserSettings({ general: { language: "en-US", theme: "dark" } });
    expect(result.general.language).toBe("en-US");
    expect(result.general.theme).toBe("dark");
    expect(result.general.fontSize).toBe("medium");
  });

  it("handles theme 'auto'", () => {
    const result = normalizeUserSettings({ general: { theme: "auto" } });
    expect(result.general.theme).toBe("auto");
  });

  it("unknown theme falls back to default", () => {
    const result = normalizeUserSettings({ general: { theme: "purple" } });
    expect(result.general.theme).toBe("light");
  });

  it("fontSize small/large", () => {
    expect(normalizeUserSettings({ general: { fontSize: "small" } }).general.fontSize).toBe("small");
    expect(normalizeUserSettings({ general: { fontSize: "large" } }).general.fontSize).toBe("large");
    expect(normalizeUserSettings({ general: { fontSize: "xl" } }).general.fontSize).toBe("medium");
  });

  it("merges privacy settings with defaults", () => {
    const result = normalizeUserSettings({ privacy: { allowStrangerAdd: false, showOnlineStatus: false } });
    expect(result.privacy.allowStrangerAdd).toBe(false);
    expect(result.privacy.showOnlineStatus).toBe(false);
    expect(result.privacy.allowViewMoments).toBe(true);
    expect(result.privacy.messageReadReceipt).toBe(true);
  });

  it("privacy.allowSearchByPhone maps to allowStrangerAdd", () => {
    const result = normalizeUserSettings({ privacy: { allowSearchByPhone: false } });
    expect(result.privacy.allowStrangerAdd).toBe(false);
  });

  it("merges message settings with defaults", () => {
    const result = normalizeUserSettings({ message: { enableSound: false } });
    expect(result.message.enableSound).toBe(false);
    expect(result.message.enableNotification).toBe(true);
  });

  it("notifications.desktop maps to message.enableNotification", () => {
    const result = normalizeUserSettings({ notifications: { desktop: false } });
    expect(result.message.enableNotification).toBe(false);
  });

  it("notifications.sound maps to message.enableSound", () => {
    const result = normalizeUserSettings({ notifications: { sound: false } });
    expect(result.message.enableSound).toBe(false);
  });

  it("merges notifications section", () => {
    const result = normalizeUserSettings({ notifications: { sound: false, desktop: false, preview: false } });
    expect(result.notifications.sound).toBe(false);
    expect(result.notifications.desktop).toBe(false);
    expect(result.notifications.preview).toBe(false);
  });
});
