package com.im.service.orchestrator;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import org.springframework.util.StringUtils;

public record MessagePreparation(
        SendMessageCommand command,
        Message message,
        MessageDTO response,
        MessageEvent event,
        String conversationId
) {

    public MessagePreparation {
        if (command == null) {
            throw new IllegalArgumentException("sendMessageCommand cannot be null");
        }
        if (message == null || message.getId() == null) {
            throw new IllegalArgumentException("prepared message cannot be null");
        }
        if (response == null || response.getId() == null) {
            throw new IllegalArgumentException("prepared response cannot be null");
        }
        if (event == null || event.getMessageId() == null) {
            throw new IllegalArgumentException("prepared message event cannot be null");
        }
        if (!StringUtils.hasText(conversationId)) {
            throw new IllegalArgumentException("conversationId cannot be blank");
        }
    }
}
