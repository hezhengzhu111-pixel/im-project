package com.im.handler;

import com.im.enums.MessageType;
import com.im.service.command.SendMessageCommand;
import com.im.service.orchestrator.MessagePreparation;

public interface MessageHandler {

    boolean supports(MessageType type);

    MessagePreparation prepare(SendMessageCommand command, Long messageId);
}
