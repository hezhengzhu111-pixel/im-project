package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.service.IImService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/im")
@Tag(name = "IM Core", description = "IM internal APIs")
public class ImController {

    private final IImService imService;

    @PostMapping("/offline/{userId}")
    @Operation(summary = "User offline")
    public ApiResponse<String> userOffline(@PathVariable("userId") String userId) {
        imService.userOffline(userId);
        return ApiResponse.success("user offline success");
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
