package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.service.impl.MessageServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PrivateMessageHandler implements MessageHandler<SendPrivateMessageRequest, MessageDTO> {

    private final MessageServiceImpl messageService;

    @Override
    public MessageDTO handle(Long senderId, SendPrivateMessageRequest request) {
        return messageService.sendPrivateMessage(senderId, request);
    }
}
