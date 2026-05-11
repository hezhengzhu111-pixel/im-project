import { describe, expect, it } from "vitest";
import {
  getFriendRequestAvatar,
  getFriendRequestDisplayName,
  isPendingIncomingFriendRequest,
} from "@/features/contacts/requestDisplay";
import type { FriendRequest } from "@/types";

describe("friend request display helpers", () => {
  it("uses the target user info for requests sent by the current user", () => {
    const request: FriendRequest = {
      id: "request-self",
      applicantId: "1",
      applicantUsername: "me",
      applicantNickname: "Me",
      applicantAvatar: "self-avatar.png",
      targetUserId: "2",
      targetUsername: "target-user",
      targetNickname: "Target User",
      targetAvatar: "target-avatar.png",
      reason: "please add me",
      status: "PENDING",
      createTime: "2026-03-23T00:00:00.000Z",
    };

    expect(getFriendRequestDisplayName(request, "1")).toBe("Target User");
    expect(getFriendRequestAvatar(request, "1")).toBe("target-avatar.png");
    expect(isPendingIncomingFriendRequest(request, "1")).toBe(false);
  });

  it("uses the applicant info for requests received by the current user", () => {
    const request: FriendRequest = {
      id: "request-other",
      applicantId: "3",
      applicantUsername: "applicant-user",
      applicantNickname: "Applicant User",
      applicantAvatar: "applicant-avatar.png",
      targetUserId: "1",
      targetUsername: "me",
      targetNickname: "Me",
      targetAvatar: "me-avatar.png",
      reason: "hi",
      status: "PENDING",
      createTime: "2026-03-23T00:01:00.000Z",
    };

    expect(getFriendRequestDisplayName(request, "1")).toBe("Applicant User");
    expect(getFriendRequestAvatar(request, "1")).toBe("applicant-avatar.png");
    expect(isPendingIncomingFriendRequest(request, "1")).toBe(true);
  });
});
