import type { FriendRequest } from "@/types";

export const getFriendRequestDisplayName = (
  request: FriendRequest,
  currentUserId: string,
) => {
  if (request.applicantId === currentUserId) {
    return (
      request.targetNickname ||
      request.targetUsername ||
      request.targetUserId ||
      "待验证用户"
    );
  }
  return request.applicantNickname || request.applicantUsername || request.applicantId;
};

export const getFriendRequestAvatar = (
  request: FriendRequest,
  currentUserId: string,
) => {
  if (request.applicantId === currentUserId) {
    return request.targetAvatar;
  }
  return request.applicantAvatar;
};

export const getFriendRequestStatusLabel = (status: FriendRequest["status"]) => {
  if (status === "ACCEPTED") return "已同意";
  if (status === "REJECTED") return "已拒绝";
  return "等待处理";
};

export const isPendingIncomingFriendRequest = (
  request: FriendRequest,
  currentUserId: string,
) => request.status === "PENDING" && request.applicantId !== currentUserId;
