package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
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
    public ApiResponse<String> userOffline(@PathVariable("userId") String userId) {
        imService.userOffline(userId);
        return ApiResponse.success("用户下线成功");
    }

    @PostMapping("/online/{userId}")
    @Operation(summary = "用户上线", description = "用户上线并创建会话")
    public ApiResponse<String> userOnline(@PathVariable("userId") String userId) {
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

    @PostMapping("/heartbeat/{userId}")
    @Operation(summary = "刷新用户心跳", description = "刷新指定用户会话心跳")
    public ApiResponse<Boolean> touchHeartbeat(@PathVariable("userId") String userId) {
        boolean touched = imService.touchUserHeartbeat(userId);
        if (!touched) {
            return ApiResponse.badRequest("用户不在线或会话已失效");
        }
        return ApiResponse.success("心跳刷新成功", true);
    }

    @PostMapping("/heartbeat")
    @Operation(summary = "批量检查在线状态", description = "批量检测用户在线状态")
    public ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody List<String> userIds) {
        return onlineStatus(userIds);
    }

    @PostMapping("/online-status")
    @Operation(summary = "在线状态查询", description = "批量查询用户在线状态")
    public ApiResponse<Map<String, Boolean>> onlineStatus(@RequestBody List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return ApiResponse.error("用户ID列表为空");
        }
        Map<String, Boolean> userStatusMap = imService.checkUsersOnlineStatus(userIds);
        return ApiResponse.success("在线状态查询成功", userStatusMap);
    }
}
