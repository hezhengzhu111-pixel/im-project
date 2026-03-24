package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.service.impl.MessageServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GroupMessageHandler implements MessageHandler<SendGroupMessageRequest, MessageDTO> {

    private final MessageServiceImpl messageService;

    @Override
    public MessageDTO handle(Long senderId, SendGroupMessageRequest request) {
        return messageService.sendGroupMessage(senderId, request);
    }
}
