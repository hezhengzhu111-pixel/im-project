package com.im.service;

import com.im.dto.MessageDTO;
import com.im.entity.Message;

import java.util.List;
import java.util.Map;

/**
 * 与im-server交互的服务
 */
public interface ImService {

    /**
     * 发送消息
     * @param message 消息对象
     * @return 是否发送成功
     */
    boolean sendMessage(MessageDTO message);

    /**
     * 用户上线
     * @param userId 用户ID
     */
    void userOnline(String userId);

    /**
     * 用户下线
     * @param userId 用户ID
     */
    void userOffline(String userId);

    /**
     * 检查用户在线状态
     * @param userIds 用户ID列表
     * @return 用户在线状态Map
     */
    Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds);
}