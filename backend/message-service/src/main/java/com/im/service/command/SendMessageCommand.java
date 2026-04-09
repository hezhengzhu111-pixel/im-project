package com.im.service.command;

import com.im.enums.MessageType;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder(toBuilder = true)
public class SendMessageCommand {

    private final Long senderId;
    private final Long receiverId;
    private final Long groupId;
    private final boolean isGroup;
    private final MessageType messageType;
    private final String clientMessageId;
    private final String content;
    private final Object extra;
    private final String mediaUrl;
    private final Long mediaSize;
    private final String mediaName;
    private final String thumbnailUrl;
    private final Integer duration;
    private final String locationInfo;
    private final Long replyToMessageId;

    public boolean isSystemMessage() {
        return messageType == MessageType.SYSTEM;
    }
}
