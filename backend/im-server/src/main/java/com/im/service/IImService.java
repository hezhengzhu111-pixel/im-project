package com.im.service;

import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;

import java.util.List;
import java.util.Map;

/**
 * IM核心服务接口
 * 定义即时通讯系统的核心业务方法
 * 
 * @author IM Team
 * @version 2.0.0
 */
public interface IImService {
    
    /**
     * 用户下线
     * 
     * @param userId 用户ID
     * @return 是否成功
     */
    boolean userOffline(String userId);
    
    /**
     * 发送私聊消息
     * 
     * @param message 消息对象
     */
    void sendPrivateMessage(MessageDTO message);
    
    /**
     * 发送群聊消息
     * 
     * @param message 消息对象
     */
    void sendGroupMessage(MessageDTO message);

    boolean pushMessageToUser(MessageDTO message, Long userId);

    boolean pushReadReceiptToUser(ReadReceiptDTO receipt, Long userId);

    /**
     * 检查多个用户的在线状态
     * 
     * @param userIds 用户ID列表
     * @return 用户会话信息列表
     */
    Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds);

    boolean touchUserHeartbeat(String userId);

    void refreshRouteHeartbeat(String userId);

    boolean hasLocalSession(String userId);

    boolean isRouteOwnedByCurrentInstance(String userId);

    String getCurrentInstanceId();
    
    /**
     * 获取用户会话信息
     *
     * @return 用户会话信息
     */
    Map<String, UserSession> getSessionUserMap();
    
    /**
     * 添加会话映射
     * @param key 键（会话ID或用户ID）
     * @param userSession 用户会话
     */
    void putSessionMapping(String key, UserSession userSession);
    
    /**
     * 移除会话映射
     * @param key 键（会话ID或用户ID）
     * @return 是否成功移除
     */
    boolean removeSessionMapping(String key);
    
    /**
     * 发送离线消息（预留扩展）
     */
    default void sendOfflineMessage(MessageDTO message) {
    }
}
