package com.im.util;

import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.message.entity.Message;

import java.util.List;
import java.util.stream.Collectors;

public class MessageConverter {

    public static MessageDTO convertToDTO(Message message,
                                          String senderName,
                                          String senderAvatar,
                                          String receiverName,
                                          String receiverAvatar,
                                          List<GroupMemberDTO> groupMembers) {
        if (message == null) {
            return null;
        }

        boolean groupMessage = Boolean.TRUE.equals(message.getIsGroupChat());

        return MessageDTO.builder()
                .id(message.getId())
                .clientMessageId(message.getClientMessageId())
                .senderId(message.getSenderId())
                .senderName(senderName)
                .senderAvatar(senderAvatar)
                .receiverId(groupMessage ? null : message.getReceiverId())
                .receiverName(groupMessage ? null : receiverName)
                .receiverAvatar(groupMessage ? null : receiverAvatar)
                .groupId(groupMessage ? message.getGroupId() : null)
                .messageType(message.getMessageType())
                .content(message.getContent())
                .mediaUrl(message.getMediaUrl())
                .mediaSize(message.getMediaSize())
                .mediaName(message.getMediaName())
                .thumbnailUrl(message.getThumbnailUrl())
                .duration(message.getDuration())
                .locationInfo(message.getLocationInfo())
                .status(getStatusString(message.getStatus()))
                .isGroupMessage(groupMessage)
                .isGroupChat(groupMessage)
                .isGroup(groupMessage)
                .replyToMessageId(message.getReplyToMessageId())
                .createdTime(message.getCreatedTime())
                .createdAt(message.getCreatedTime())
                .updatedTime(message.getUpdatedTime())
                .updatedAt(message.getUpdatedTime())
                .readStatus(message.getStatus() != null && message.getStatus() == 3 ? 1 : 0)
                .readAt(message.getStatus() != null && message.getStatus() == 3 ? message.getUpdatedTime() : null)
                .groupMembers(groupMessage ? copyGroupMembers(groupMembers) : null)
                .build();
    }

    private static String getStatusString(Integer status) {
        if (status == null) {
            return "SENDING";
        }
        return switch (status) {
            case 1 -> "SENT";
            case 2 -> "DELIVERED";
            case 3 -> "READ";
            case 4 -> "RECALLED";
            case 5 -> "DELETED";
            default -> "SENDING";
        };
    }

    private static List<GroupMemberDTO> copyGroupMembers(List<GroupMemberDTO> groupMembers) {
        if (groupMembers == null) {
            return null;
        }
        return groupMembers.stream()
                .map(MessageConverter::copyGroupMember)
                .collect(Collectors.toList());
    }

    private static GroupMemberDTO copyGroupMember(GroupMemberDTO member) {
        if (member == null) {
            return null;
        }
        String roleName = member.getRoleName();
        if (roleName == null || roleName.isBlank()) {
            roleName = getRoleName(member.getRole());
        }
        return GroupMemberDTO.builder()
                .groupId(member.getGroupId())
                .userId(member.getUserId())
                .username(member.getUsername())
                .nickname(member.getNickname())
                .avatar(member.getAvatar())
                .role(member.getRole())
                .roleName(roleName)
                .isOnline(member.getIsOnline())
                .joinTime(member.getJoinTime())
                .lastActiveTime(member.getLastActiveTime())
                .build();
    }

    private static String getRoleName(Integer role) {
        if (role == null) {
            return "\u666e\u901a\u6210\u5458";
        }
        return switch (role) {
            case 2 -> "\u7ba1\u7406\u5458";
            case 3 -> "\u7fa4\u4e3b";
            default -> "\u666e\u901a\u6210\u5458";
        };
    }
}
