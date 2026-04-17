package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import com.im.enums.MessageType;
import com.im.service.MessageService;
import com.im.service.command.SendMessageCommand;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/message")
@Validated
@RequiredArgsConstructor
public class MessageInternalController {

    private final MessageService messageService;

    @PostMapping("/system/private")
    public ApiResponse<MessageDTO> sendSystemPrivateMessage(@Valid @RequestBody SendSystemMessageRequest request) {
        MessageDTO dto = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(request.getSenderId())
                .receiverId(request.getReceiverId())
                .isGroup(false)
                .messageType(MessageType.SYSTEM)
                .content(request.getContent())
                .build());
        return ApiResponse.success("system message sent", dto);
    }
}
