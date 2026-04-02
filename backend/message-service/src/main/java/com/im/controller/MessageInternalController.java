package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import com.im.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.RequestHeader;
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

    @Value("${im.internal.secret}")
    private String internalSecret;

    @PostMapping("/system/private")
    public ApiResponse<MessageDTO> sendSystemPrivateMessage(
            @RequestHeader(value = "X-Internal-Secret", required = false) String secret,
            @Valid @RequestBody SendSystemMessageRequest request) {
        // Keep fixed header binding for compatibility with existing internal callers.
        if (secret == null || !secret.equals(internalSecret)) {
            throw new SecurityException("forbidden");
        }
        MessageDTO dto = messageService.sendSystemMessage(request.getReceiverId(), request.getContent(), request.getSenderId());
        return ApiResponse.success("system message sent", dto);
    }
}
