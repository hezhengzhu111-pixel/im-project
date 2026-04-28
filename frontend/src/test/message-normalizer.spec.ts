import {describe, expect, it} from "vitest";
import {normalizeMessage} from "@/normalizers/message";

describe("message normalizer", () => {
  it("normalizes media fields from snake case and extra metadata", () => {
    const message = normalizeMessage({
      id: 1,
      sender_id: 2,
      receiver_id: 3,
      messageType: "IMAGE",
      content: "",
      media_url: "/files/images/2026-04-28/a.png",
      media_size: "1024",
      media_name: "a.png",
      thumbnail_url: "/files/images/2026-04-28/a-thumb.png",
      duration: "7",
      created_at: "2026-04-28T10:00:00.000000",
      status: 1,
    });

    expect(message.mediaUrl).toBe("/files/images/2026-04-28/a.png");
    expect(message.mediaSize).toBe(1024);
    expect(message.mediaName).toBe("a.png");
    expect(message.thumbnailUrl).toBe("/files/images/2026-04-28/a-thumb.png");
    expect(message.duration).toBe(7);
  });

  it("falls back to non-text content and extra metadata for media messages", () => {
    const message = normalizeMessage({
      id: "voice-1",
      senderId: "2",
      receiverId: "3",
      messageType: "VOICE",
      content: "/files/audios/2026-04-28/v.webm",
      extra: {
        mediaName: "v.webm",
        mediaSize: 2048,
        duration: 3,
      },
      createdAt: "2026-04-28T10:00:00.000",
      status: "SENT",
    });

    expect(message.mediaUrl).toBe("/files/audios/2026-04-28/v.webm");
    expect(message.mediaName).toBe("v.webm");
    expect(message.mediaSize).toBe(2048);
    expect(message.duration).toBe(3);
  });
});
