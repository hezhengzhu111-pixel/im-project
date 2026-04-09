package com.im.service;

import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.dto.MessageDTO;
import com.im.dto.ConversationDTO;
import com.im.service.command.SendMessageCommand;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 消息服务接口
 */
public interface MessageService {

    MessageDTO sendMessage(SendMessageCommand command);
    
    /**
     * 发送私聊消息
     * @param senderId 发送者ID
     * @param request 发送私聊消息请求对象
     * @return 消息对象
     */
    MessageDTO sendPrivateMessage(Long senderId, SendPrivateMessageRequest request);
    
    /**
     * 发送群聊消息
     * @param senderId 发送者ID
     * @param request 群聊消息请求对象
     * @return 消息对象
     */
    MessageDTO sendGroupMessage(Long senderId, SendGroupMessageRequest request);

    /**
     * Send system private message and persist it as regular message data.
     */
    MessageDTO sendSystemMessage(Long receiverId, String content, Long senderId);
    
    /**
     * 获取用户的会话列表
     * @param userId 用户ID
     * @return 会话列表
     */
    List<ConversationDTO> getConversations(Long userId);
    
    /**
     * 标记消息为已读
     * @param userId 用户ID
     * @param conversationId 会话ID
     */
    void markAsRead(Long userId, String conversationId);
    
    /**
     * 获取私聊消息历史
     * @param userId 当前用户ID
     * @param friendId 好友ID
     * @param page 页码（从0开始）
     * @param size 每页大小
     * @return 消息列表
     */
    List<MessageDTO> getPrivateMessages(Long userId, Long friendId, int page, int size);
    
    /**
     * 获取群聊消息历史
     * @param userId 当前用户ID
     * @param groupId 群组ID
     * @param page 页码（从0开始）
     * @param size 每页大小
     * @return 消息列表
     */
    List<MessageDTO> getGroupMessages(Long userId, Long groupId, int page, int size);

    List<MessageDTO> getPrivateMessagesCursor(Long userId,
                                              Long friendId,
                                              Long lastMessageId,
                                              LocalDateTime beforeTimestamp,
                                              Long afterMessageId,
                                              int limit);

    List<MessageDTO> getGroupMessagesCursor(Long userId,
                                           Long groupId,
                                           Long lastMessageId,
                                           LocalDateTime beforeTimestamp,
                                           Long afterMessageId,
                                           int limit);

    MessageDTO recallMessage(Long userId, Long messageId);

    MessageDTO deleteMessage(Long userId, Long messageId);
}
