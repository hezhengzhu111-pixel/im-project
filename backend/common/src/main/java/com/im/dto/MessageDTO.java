package com.im.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.im.enums.MessageType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 娑堟伅璇︽儏DTO
 * 鐢ㄤ簬灏佽娑堟伅鐨勭浉鍏充俊鎭紝浠ヤ究鍦ㄧ郴缁熷唴閮ㄤ紶閫掑拰澶勭悊
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MessageDTO {
    public static final String ACK_STAGE_ACCEPTED = "ACCEPTED";
    public static final String ACK_STAGE_PERSISTED = "PERSISTED";

    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;
    private String clientMessageId;
    @JsonSerialize(using = ToStringSerializer.class)
    private Long senderId;
    private String senderName;
    private String senderAvatar;
    @JsonSerialize(using = ToStringSerializer.class)
    private Long receiverId;
    private String receiverName;
    private String receiverAvatar;
    @JsonSerialize(using = ToStringSerializer.class)
    private Long groupId;
    private MessageType messageType;
    private String content;
    private String mediaUrl;
    private Long mediaSize;
    private String mediaName;
    private String thumbnailUrl;
    private Integer duration;
    private String locationInfo;
    private String status;
    @JsonProperty("isGroupMessage")
    private Boolean isGroupMessage;
    @JsonProperty("isGroupChat")
    private Boolean isGroupChat;
    @JsonSerialize(using = ToStringSerializer.class)
    private Long replyToMessageId;
    private LocalDateTime createdTime;
    @JsonProperty("created_at")
    private LocalDateTime createdAt;
    private LocalDateTime updatedTime;
    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
    @JsonProperty("read_status")
    private Integer readStatus;
    @JsonProperty("read_at")
    private LocalDateTime readAt;
    private String ackStage;
    @JsonProperty("isGroup")
    private boolean isGroup;
    private List<GroupMemberDTO> groupMembers;
}
