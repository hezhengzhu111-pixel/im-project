package com.im.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageEvent {

    private MessageEventType eventType;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long messageId;

    private String conversationId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long senderId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long receiverId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long groupId;

    private String clientMsgId;
    private String clientMessageId;
    private MessageType messageType;
    private String content;
    private String mediaUrl;
    private Long mediaSize;
    private String mediaName;
    private String thumbnailUrl;
    private Integer duration;
    private String locationInfo;
    private Integer status;
    private String statusText;
    private Boolean group;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long replyToMessageId;

    private LocalDateTime createdTime;
    private LocalDateTime updatedTime;
    private String senderName;
    private String senderAvatar;
    private String receiverName;
    private String receiverAvatar;
    private MessageDTO payload;
    private ReadReceiptDTO readReceiptPayload;
    private Integer version;
}
