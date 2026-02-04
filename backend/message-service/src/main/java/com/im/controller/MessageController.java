package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.ConversationDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.entity.Message;
import com.im.service.MessageService;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 消息控制器
 */
@RestController
@RequestMapping("/api/messages")
@Validated
public class MessageController {

    @Autowired
    private MessageService messageService;

    /**
     * 发送私聊消息
     */
    @PostMapping("/send/private")
    public ApiResponse<String> sendPrivateMessage(
            @RequestAttribute Long userId,
            @Valid @RequestBody SendPrivateMessageRequest request) {
        messageService.sendPrivateMessage(userId, request);
        return ApiResponse.success("发送私聊消息成功", "私聊消息发送成功");
    }

    /**
     * 发送群聊消息
     */
    @PostMapping("/send/group")
    public ApiResponse<String> sendGroupMessage(
            @RequestAttribute Long userId,
            @Valid @RequestBody SendGroupMessageRequest request) {
        messageService.sendGroupMessage(userId, request);
        return ApiResponse.success("发送群聊消息成功", "群聊消息发送成功");
    }
    
    /**
     * 获取会话列表
     */
    @GetMapping("/conversations")
    public ApiResponse<List<ConversationDTO>> getConversations(@RequestAttribute Long userId) {
        List<ConversationDTO> conversations = messageService.getConversations(userId);
        return ApiResponse.success("获取会话列表成功", conversations);
    }
    
    /**
     * 获取私聊消息
     */
    @GetMapping("/private/{friendId}")
    public ApiResponse<List<Message>> getPrivateMessages(
            @RequestAttribute Long userId,
            @PathVariable Long friendId,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "page不能小于0") int page,
            @RequestParam(defaultValue = "50") @Min(value = 1, message = "size不能小于1") @Max(value = 200, message = "size不能大于200") int size) {
        List<Message> messages = messageService.getPrivateMessages(userId, friendId, page, size);
        return ApiResponse.success("获取私聊消息成功", messages);
    }
    
    /**
     * 获取群聊消息
     */
    @GetMapping("/group/{groupId}")
    public ApiResponse<List<Message>> getGroupMessages(
            @RequestAttribute Long userId,
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "page不能小于0") int page,
            @RequestParam(defaultValue = "50") @Min(value = 1, message = "size不能小于1") @Max(value = 200, message = "size不能大于200") int size) {
        List<Message> messages = messageService.getGroupMessages(userId, groupId, page, size);
        return ApiResponse.success("获取群聊消息成功", messages);
    }
    
    /**
     * 标记消息为已读
     */
    @PostMapping("/read/{conversationId}")
    public ApiResponse<String> markAsRead(
            @RequestAttribute Long userId,
            @PathVariable String conversationId) {
        messageService.markAsRead(userId, conversationId);
        return ApiResponse.success("标记已读成功", "消息已标记为已读");
    }
}
