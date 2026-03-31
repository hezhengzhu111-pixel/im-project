package com.im.dto;

import com.im.enums.MessageType;


import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;
import java.util.List;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.NoArgsConstructor;

/**
 * 消息详情DTO
 * 用于封装消息的相关信息，以便在系统内部传递和处理
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MessageDTO {
    // 消息的唯一标识符
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;
    // 发送者的唯一标识符
    @JsonSerialize(using = ToStringSerializer.class)
    private Long senderId;
    // 发送者的名称
    private String senderName;
    // 发送者的头像URL
    private String senderAvatar;
    // 接收者的唯一标识符
    @JsonSerialize(using = ToStringSerializer.class)
    private Long receiverId;
    // 接收者的名称
    private String receiverName;
    // 接收者的头像URL
    private String receiverAvatar;
    // 如果是群消息，则为群的唯一标识符
    @JsonSerialize(using = ToStringSerializer.class)
    private Long groupId;
    // 消息的类型，如文本、图片等
    private MessageType messageType;
    // 消息的内容
    private String content;
    // 媒体文件的URL，如图片、视频等
    private String mediaUrl;
    // 媒体文件的大小
    private Long mediaSize;
    // 媒体文件的名称
    private String mediaName;
    // 缩略图的URL
    private String thumbnailUrl;
    // 媒体文件的时长，单位为秒
    private Integer duration;
    // 位置信息，如果消息包含地理位置
    private String locationInfo;
    // 消息的状态，如发送中、已发送等
    private String status;
    // 标识是否为群消息
    @JsonProperty("isGroupMessage")
    private Boolean isGroupMessage;
    @JsonProperty("isGroupChat")
    private Boolean isGroupChat;
    // 如果消息是对另一条消息的回复，则为被回复消息的ID
    @JsonSerialize(using = ToStringSerializer.class)
    private Long replyToMessageId;
    // 消息创建的时间
    private LocalDateTime createdTime;
    @JsonProperty("created_at")
    private LocalDateTime createdAt;
    // 消息更新的时间
    private LocalDateTime updatedTime;
    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
    @JsonProperty("read_status")
    private Integer readStatus;
    @JsonProperty("read_at")
    private LocalDateTime readAt;
    // 标识是否为群聊消息
    @JsonProperty("isGroup")
    private boolean isGroup;
    // 如果是群消息，包含群成员的信息
    private List<GroupMemberDTO> groupMembers;
}
