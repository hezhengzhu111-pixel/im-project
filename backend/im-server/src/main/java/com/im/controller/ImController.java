package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/im")
@Tag(name = "IM Core", description = "IM internal APIs")
public class ImController {

    private final IImService imService;

    @PostMapping("/sendMessage")
    @Operation(summary = "Deprecated endpoint")
    public ApiResponse<Boolean> sendMessage(@RequestBody MessageDTO message) {
        log.warn("Deprecated /api/im/sendMessage called. messageId={}", message == null ? null : message.getId());
        return ApiResponse.forbidden("deprecated endpoint, use message-service send APIs");
    }

    @PostMapping("/offline/{userId}")
    @Operation(summary = "User offline")
    public ApiResponse<String> userOffline(@PathVariable("userId") String userId) {
        imService.userOffline(userId);
        return ApiResponse.success("user offline success");
    }

    @PostMapping("/online/{userId}")
    @Operation(summary = "User online")
    public ApiResponse<String> userOnline(@PathVariable("userId") String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            return ApiResponse.error("userId cannot be blank");
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
        return ApiResponse.success("user online success");
    }

    @PostMapping("/heartbeat/{userId}")
    @Operation(summary = "Refresh user heartbeat")
    public ApiResponse<Boolean> touchHeartbeat(@PathVariable("userId") String userId) {
        boolean touched = imService.touchUserHeartbeat(userId);
        if (!touched) {
            return ApiResponse.badRequest("user offline or session invalid");
        }
        return ApiResponse.success("heartbeat refreshed", true);
    }

    @PostMapping("/heartbeat")
    @Operation(summary = "Batch online status")
    public ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody List<String> userIds) {
        return onlineStatus(userIds);
    }

    @PostMapping("/online-status")
    @Operation(summary = "Batch online status")
    public ApiResponse<Map<String, Boolean>> onlineStatus(@RequestBody List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return ApiResponse.error("userIds cannot be empty");
        }
        Map<String, Boolean> userStatusMap = imService.checkUsersOnlineStatus(userIds);
        return ApiResponse.success("online status queried", userStatusMap);
    }
}
