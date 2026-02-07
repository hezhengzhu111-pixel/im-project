package com.im.util;

import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.entity.GroupMember;
import com.im.entity.Message;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 消息转换工具类
 */

public class MessageConverter {

    /**
     * 统一转换方法：根据isGroupChat字段自动判断并转换为MessageDTO
     * @param message 消息实体
     * @param senderName 发送者姓名
     * @param senderAvatar 发送者头像
     * @param receiverName 接收者姓名（私聊时使用，群聊时可为null）
     * @param receiverAvatar 接收者头像（私聊时使用，群聊时可为null）
     * @param groupMembers 群成员列表（群聊时使用，私聊时可为null）
     * @return MessageDTO
     */
    public static MessageDTO convertToDTO(Message message,
                                          String senderName,
                                          String senderAvatar,
                                          String receiverName,
                                          String receiverAvatar,
                                          List<GroupMember> groupMembers) {
        if (message == null) {
            return null;
        }

        return MessageDTO.builder()
                .id(message.getId())
                .senderId(message.getSenderId())
                .senderName(senderName)
                .senderAvatar(senderAvatar)
                .receiverId(message.getIsGroupChat() ? null : message.getReceiverId())
                .receiverName(message.getIsGroupChat() ? null : receiverName)
                .receiverAvatar(message.getIsGroupChat() ? null : receiverAvatar)
                .groupId(message.getIsGroupChat() ? message.getGroupId() : null)
                .messageType(message.getMessageType())
                .content(message.getContent())
                .mediaUrl(message.getMediaUrl())
                .mediaSize(message.getMediaSize())
                .mediaName(message.getMediaName())
                .thumbnailUrl(message.getThumbnailUrl())
                .duration(message.getDuration())
                .locationInfo(message.getLocationInfo())
                .status(getStatusString(message.getStatus()))
                .isGroupMessage(message.getIsGroupChat())
                .isGroup(message.getIsGroupChat())
                .replyToMessageId(message.getReplyToMessageId())
                .createdTime(message.getCreatedTime())
                .createdAt(message.getCreatedTime())
                .updatedTime(message.getUpdatedTime())
                .updatedAt(message.getUpdatedTime())
                .readStatus(message.getStatus() != null && message.getStatus() == 3 ? 1 : 0)
                .readAt(message.getStatus() != null && message.getStatus() == 3 ? message.getUpdatedTime() : null)
                .groupMembers(message.getIsGroupChat() ? convertGroupMembersToDTO(groupMembers) : null)
                .build();
    }

    /**
     * 将状态码转换为状态字符串
     */
    private static String getStatusString(Integer status) {
        if (status == null) return "SENDING";
        switch (status) {
            case 1: return "SENT";
            case 2: return "DELIVERED";
            case 3: return "READ";
            case 4: return "RECALLED";
            case 5: return "DELETED";
            default: return "SENDING";
        }
    }

    /**
     * 将GroupMember列表转换为GroupMemberDTO列表
     */
    private static List<GroupMemberDTO> convertGroupMembersToDTO(List<GroupMember> groupMembers) {
        if (groupMembers == null) {
            return null;
        }

        return groupMembers.stream()
                .map(member -> GroupMemberDTO.builder()
                        .groupId(member.getGroupId())
                        .userId(member.getUserId())
                        .nickname(member.getNickname())
                        .role(member.getRole())
                        .roleName(getRoleName(member.getRole()))
                        .joinTime(member.getJoinTime())
                        .build())
                .collect(Collectors.toList());
    }

    /**
     * 根据角色代码获取角色名称
     */
    private static String getRoleName(Integer role) {
        if (role == null) return "普通成员";
        switch (role) {
            case 1: return "普通成员";
            case 2: return "管理员";
            case 3: return "群主";
            default: return "普通成员";
        }
    }
}
