package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.service.command.SendMessageCommand;

public interface MessageHandler {

    boolean supports(SendMessageCommand command);

    MessageDTO handle(SendMessageCommand command);
}
