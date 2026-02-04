package com.im.controller;

import com.im.constants.ImConstants;
import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
// DatabaseService依赖已移除
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 即时通讯服务控制器
 * 提供完整的IM基础服务平台REST API接口
 * 支持消息发送、用户状态管理等核心功能
 * 
 * @author IM Team
 * @version 2.0.0
 */
@Slf4j
@RestController
@RequestMapping("/api/im")
@Tag(name = "IM Core", description = "即时通讯核心服务接口")
public class ImController {
    
    @Autowired
    private IImService imService;

    /**
     * 发送消息
     * @param message 消息对象   消息内容、发送者ID、接收者ID、是否群聊等
     * @return 响应结果对象  包含消息ID、发送时间等信息
     */
    @PostMapping("/sendMessage")
    @Operation(summary = "发送消息", description = "支持私聊和群聊消息发送")
    public ApiResponse<Boolean> sendMessage(@RequestBody MessageDTO message) {
        if (message.isGroup()) {
            imService.sendGroupMessage(message);
            return ApiResponse.success("群聊消息发送成功",true);
        } else {
            imService.sendPrivateMessage(message);
            return ApiResponse.success("私聊消息发送成功",true);
        }
    }
    

    /**
     * 用户下线
     * @param userId 用户ID
     * @return
     */
    @PostMapping("/offline/{userId}")
    @Operation(summary = "用户下线", description = "强制用户下线")
    public ApiResponse<String> userOffline(@PathVariable String userId) {
        imService.userOffline(userId);
        return ApiResponse.success("用户下线成功");
    }

    @PostMapping("/online/{userId}")
    @Operation(summary = "用户上线", description = "用户上线并创建会话")
    public ApiResponse<String> userOnline(@PathVariable String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            return ApiResponse.error("用户ID不能为空");
        }
        UserSession session = imService.getSessionUserMap().get(userId);
        if (session == null) {
            session = UserSession.builder()
                    .userId(userId)
                    .status(UserStatus.ONLINE)
                    .connectTime(java.time.LocalDateTime.now())
                    .lastHeartbeat(java.time.LocalDateTime.now())
                    .build();
            imService.putSessionMapping(userId, session);
        } else {
            session.setStatus(UserStatus.ONLINE);
            session.setLastHeartbeat(java.time.LocalDateTime.now());
        }
        return ApiResponse.success("用户上线成功");
    }

    /**
     * 心跳检测和获取在线用户状态
     * @param userIds 用户ID列表
     * @return 用户在线状态信息
     */
    @PostMapping("/heartbeat")
    @Operation(summary = "心跳检测", description = "批量检测用户在线状态")
    public ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody List<String> userIds) {
        try {
            if (userIds == null || userIds.isEmpty()) {
                log.warn("心跳检测失败: 用户ID列表为空");
                return ApiResponse.error("用户ID列表为空");
            }
            
            // 批量检查用户在线状态并更新心跳
            Map<String, Boolean> userStatusMap = imService.checkUsersOnlineStatus(userIds);

            return ApiResponse.success("心跳检测成功", userStatusMap);
            
        } catch (Exception e) {
            log.error("心跳检测异常", e);
            return ApiResponse.error("心跳检测失败");
        }
    }
}
