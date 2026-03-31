package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 消息操作控制器（撤回/删除）
 */
@RestController
@RequestMapping("/s")
@Validated
public class MessageActionController {

    @Autowired
    private MessageService messageService;

    @PostMapping("/recall/{messageId}")
    public ApiResponse<MessageDTO> recall(
            @RequestAttribute("userId") Long userId,
            @PathVariable("messageId") Long messageId) {
        MessageDTO dto = messageService.recallMessage(userId, messageId);
        return ApiResponse.success("撤回成功", dto);
    }

    @PostMapping("/delete/{messageId}")
    public ApiResponse<MessageDTO> delete(
            @RequestAttribute("userId") Long userId,
            @PathVariable("messageId") Long messageId) {
        MessageDTO dto = messageService.deleteMessage(userId, messageId);
        return ApiResponse.success("删除成功", dto);
    }
}

