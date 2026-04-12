package com.im.dto.request;

import com.im.enums.MessageType;
import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 发送私聊消息请求
 */
@Data
public class SendPrivateMessageRequest {
    
    @NotNull(message = "接收者ID不能为空")
    private String receiverId;

    @Size(max = 64, message = "clientMessageId过长")
    private String clientMessageId;
    
    private MessageType messageType = MessageType.TEXT;
    
    @Size(max = 10000000, message = "消息内容过长")
    private String content;
    
    // 用于接收前端传来的额外信息，如 {isBase64: true}
    private Object extra;
    
    private String mediaUrl;
    
    private Long mediaSize;
    
    private String mediaName;
    
    private String thumbnailUrl;
    
    private Integer duration;
    
    private String locationInfo;
    
    private Long replyToMessageId;
}
