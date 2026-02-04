package com.im.entity;

import com.im.enums.UserStatus;
import lombok.*;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.Set;

/**
 * 用户会话实体类
 * 用于管理用户的WebSocket连接状态
 * 
 * @author IM Team
 * @version 1.0.0
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSession {
    
    /**
     * 用户ID
     */
    private String userId;
    
    /**
     * 用户状态
     */
    private UserStatus status;
    
    /**
     * 最后心跳时间
     */
    private LocalDateTime lastHeartbeat;
    
    /**
     * 连接时间
     */
    private LocalDateTime connectTime;
    
    /**
     * 用户所在的群组ID集合
     */
    private Set<String> groupIds;
    
    /**
     * 客户端信息
     */
    private String clientInfo;

    /**
     * WebSocket  会话对象
     */
    private WebSocketSession webSocketSession;


}