package com.im.dto;

import com.im.enums.MessageType;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 会话列表DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ConversationDTO implements Serializable {
    private String conversationId;
    private Integer conversationType; // 1-私聊, 2-群聊
    private String conversationName;
    private String conversationAvatar;
    private String lastMessage;
    private MessageType lastMessageType;
    private String lastMessageSenderId;
    private String lastMessageSenderName;
    private LocalDateTime lastMessageTime;
    private Long unreadCount;
    private Boolean isOnline;
    private Boolean isPinned;
    private Boolean isMuted;
}
