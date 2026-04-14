package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.service.command.SendMessageCommand;

public interface MessageHandler {

    boolean supports(MessageType type);

    MessageDTO handle(SendMessageCommand command);
}
