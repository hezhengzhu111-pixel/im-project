package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.ConversationDTO;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.service.MessageService;

import java.util.List;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDateTime;

import com.im.handler.PrivateMessageHandler;
import com.im.handler.GroupMessageHandler;

/**
 * 消息控制器
 */
@RestController
@RequestMapping("/s")
@Validated
public class MessageController {

    @Autowired
    private MessageService messageService;

    @Autowired
    private PrivateMessageHandler privateMessageHandler;

    @Autowired
    private GroupMessageHandler groupMessageHandler;

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @GetMapping("/config")
    public ApiResponse<Map<String, Object>> getClientConfig() {
        Map<String, Object> data = new HashMap<>();
        data.put("textEnforce", textEnforce);
        data.put("textMaxLength", textMaxLength);
        return ApiResponse.success("获取配置成功", data);
    }

    /**
     * 发送私聊消息
     */
    @PostMapping("/send/private")
    public ApiResponse<MessageDTO> sendPrivateMessage(
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody SendPrivateMessageRequest request) {
        MessageDTO dto = privateMessageHandler.handle(userId, request);
        return ApiResponse.success("发送私聊消息成功", dto);
    }

    /**
     * 发送群聊消息
     */
    @PostMapping("/send/group")
    public ApiResponse<MessageDTO> sendGroupMessage(
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody SendGroupMessageRequest request) {
        MessageDTO dto = groupMessageHandler.handle(userId, request);
        return ApiResponse.success("发送群聊消息成功", dto);
    }
    
    /**
     * 获取会话列表
     */
    @GetMapping("/conversations")
    public ApiResponse<List<ConversationDTO>> getConversations(@RequestAttribute("userId") Long userId) {
        List<ConversationDTO> conversations = messageService.getConversations(userId);
        return ApiResponse.success("获取会话列表成功", conversations);
    }
    
    /**
     * 获取私聊消息
     */
    @GetMapping("/private/{friendId}")
    public ApiResponse<List<MessageDTO>> getPrivateMessages(
            @RequestAttribute("userId") Long userId,
            @PathVariable("friendId") Long friendId,
            @RequestParam(value = "page", defaultValue = "0") @Min(value = 0, message = "page不能小于0") int page,
            @RequestParam(value = "size", defaultValue = "50") @Min(value = 1, message = "size不能小于1") @Max(value = 200, message = "size不能大于200") int size) {
        List<MessageDTO> messages = messageService.getPrivateMessages(userId, friendId, page, size);
        return ApiResponse.success("获取私聊消息成功", messages);
    }

    @GetMapping("/private/{friendId}/cursor")
    public ApiResponse<List<MessageDTO>> getPrivateMessagesCursor(
            @RequestAttribute("userId") Long userId,
            @PathVariable("friendId") Long friendId,
            @RequestParam(value = "last_message_id", required = false) Long lastMessageId,
            @RequestParam(value = "before_timestamp", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime beforeTimestamp,
            @RequestParam(value = "after_message_id", required = false) Long afterMessageId,
            @RequestParam(value = "limit", defaultValue = "20") @Min(value = 1, message = "limit不能小于1") @Max(value = 200, message = "limit不能大于200") int limit) {
        List<MessageDTO> messages = messageService.getPrivateMessagesCursor(userId, friendId, lastMessageId, beforeTimestamp, afterMessageId, limit);
        return ApiResponse.success("获取私聊消息成功", messages);
    }
    
    /**
     * 获取群聊消息
     */
    @GetMapping("/group/{groupId}")
    public ApiResponse<List<MessageDTO>> getGroupMessages(
            @RequestAttribute("userId") Long userId,
            @PathVariable("groupId") Long groupId,
            @RequestParam(value = "page", defaultValue = "0") @Min(value = 0, message = "page不能小于0") int page,
            @RequestParam(value = "size", defaultValue = "50") @Min(value = 1, message = "size不能小于1") @Max(value = 200, message = "size不能大于200") int size) {
        List<MessageDTO> messages = messageService.getGroupMessages(userId, groupId, page, size);
        return ApiResponse.success("获取群聊消息成功", messages);
    }

    @GetMapping("/group/{groupId}/cursor")
    public ApiResponse<List<MessageDTO>> getGroupMessagesCursor(
            @RequestAttribute("userId") Long userId,
            @PathVariable("groupId") Long groupId,
            @RequestParam(value = "last_message_id", required = false) Long lastMessageId,
            @RequestParam(value = "before_timestamp", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime beforeTimestamp,
            @RequestParam(value = "after_message_id", required = false) Long afterMessageId,
            @RequestParam(value = "limit", defaultValue = "20") @Min(value = 1, message = "limit不能小于1") @Max(value = 200, message = "limit不能大于200") int limit) {
        List<MessageDTO> messages = messageService.getGroupMessagesCursor(userId, groupId, lastMessageId, beforeTimestamp, afterMessageId, limit);
        return ApiResponse.success("获取群聊消息成功", messages);
    }
    
    /**
     * 标记消息为已读
     */
    @PostMapping("/read/{conversationId}")
    public ApiResponse<String> markAsRead(
            @RequestAttribute("userId") Long userId,
            @PathVariable("conversationId") String conversationId) {
        messageService.markAsRead(userId, conversationId);
        return ApiResponse.success("标记已读成功", "消息已标记为已读");
    }
}
