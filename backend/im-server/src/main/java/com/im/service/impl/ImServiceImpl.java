package com.im.service.impl;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageStatus;
import com.im.enums.UserStatus;
// DatabaseService依赖已移除
import com.im.service.IImService;
import com.im.utils.SnowflakeIdGenerator;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
// Redis相关导入已移除
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 即时通讯核心服务实现类
 * 提供用户状态管理、消息发送、会话管理等核心业务功能
 * 采用Redis存储用户状态，Kafka处理消息队列，内存管理会话信息
 * 
 * @author IM Team
 * @version 2.0.0
 */
@Slf4j
@Service
public class ImServiceImpl implements IImService {
    
    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private SnowflakeIdGenerator snowflakeIdGenerator;

    @Value("${im.kafka.topic.private-message}")
    private String privateMessageTopic;

    @Value("${im.kafka.topic.group-message}")
    private String groupMessageTopic;
    
    @Value("${im.kafka.topic.offline-message}")
    private String offlineMessageTopic;


    /**
     * 用户会话状态管理容器
     * 使用ConcurrentHashMap保证线程安全
     * 存储用户在线状态、会话信息等关键数据
     */
    private final Map<String, UserSession> sessionUserMap = new ConcurrentHashMap<>();
    
    @Override
    public Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds) {
        // 构建Map<userId, 是否在线>结构
        Map<String, Boolean> userStatusMap = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            log.warn("用户ID列表为空");
            return userStatusMap;
        }
        try {
            for (String userId : userIds) {
                if (StringUtils.isBlank(userId)) {
                    continue;
                }
                UserSession userSession = sessionUserMap.get(userId);

                if (userSession != null) {
                    // 更新心跳时间
                    userSession.setLastHeartbeat(LocalDateTime.now());
                    log.debug("用户在线状态更新: userId={}", userId);

                    userStatusMap.put(userSession.getUserId(), userSession.getStatus() == UserStatus.ONLINE);

                    log.info("心跳检测完成: 检查用户数={}, 在线用户数={}",
                            userIds.size(),
                            userStatusMap.values().stream().mapToLong(online -> online ? 1 : 0).sum());
                } else {
                    log.debug("用户不在线: userId={}", userId);
                    userStatusMap.put(userId, false);
                }
            }
            
        } catch (Exception e) {
            log.error("批量检查用户状态异常: userIds={}", userIds, e);
        }
        
        return userStatusMap;
    }
    
    @Override
    public boolean userOffline(String userId) {
        try {
            log.info("开始处理用户下线: userId={}", userId);
            
            // 参数校验
            if (userId == null || userId.trim().isEmpty()) {
                log.warn("用户下线失败: 用户ID为空");
                return false;
            }
            // 用户下线逻辑（Redis相关代码已移除）
            // 清理内存中的用户会话信息
            UserSession removedSession = sessionUserMap.remove(userId);
            if (removedSession != null) {
                log.debug("清理用户会话信息: userId={}, 会话时长={}分钟", 
                    userId, 
                    Duration.between(removedSession.getConnectTime(), LocalDateTime.now()).toMinutes());
            }
            // 用户离线状态只在内存中维护，不再保存到数据库
            log.info("用户下线成功: userId={}, 当前在线用户数={}", userId, sessionUserMap.size());
            return true;
            
        } catch (Exception e) {
            log.error("用户下线处理异常: userId={}", userId, e);
            return false;
        }
    }


    @Override
    public void sendPrivateMessage(MessageDTO message) {
        // im-server 仅作为消息消费者，不再生产 Kafka 消息
        // 实际的推送逻辑由 KafkaMessageListener -> WebSocketHandler 处理
        log.debug("im-server 收到私聊消息发送请求 (应由 Listener 处理): {}", message);
    }
    
    @Override
    public void sendGroupMessage(MessageDTO message) {
        // im-server 仅作为消息消费者，不再生产 Kafka 消息
        // 实际的推送逻辑由 KafkaMessageListener -> WebSocketHandler 处理
        log.debug("im-server 收到群聊消息发送请求 (应由 Listener 处理): {}", message);
    }




    @Override
    public Map<String, UserSession> getSessionUserMap() {
        return sessionUserMap;
    }
    
    @Override
    public void putSessionMapping(String key, UserSession userSession) {
        sessionUserMap.put(key, userSession);
    }
    
    @Override
    public boolean removeSessionMapping(String key) {
        return sessionUserMap.remove(key) != null;
    }


}
