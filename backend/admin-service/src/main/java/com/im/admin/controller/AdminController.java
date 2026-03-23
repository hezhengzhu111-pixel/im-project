package com.im.admin.controller;

import com.im.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin Platform API", description = "后台管理系统聚合接口")
public class AdminController {

    @Operation(summary = "用户管理 - 封禁用户")
    @PostMapping("/users/{userId}/ban")
    public ApiResponse<Void> banUser(@PathVariable String userId) {
        // 调用 user-service feign 接口
        return ApiResponse.success(null);
    }

    @Operation(summary = "群组管理 - 解散群组")
    @PostMapping("/groups/{groupId}/dismiss")
    public ApiResponse<Void> dismissGroup(@PathVariable String groupId) {
        // 调用 group-service feign 接口
        return ApiResponse.success(null);
    }

    @Operation(summary = "消息管理 - 全局撤回消息")
    @PostMapping("/messages/{messageId}/recall")
    public ApiResponse<Void> recallMessage(@PathVariable String messageId) {
        // 调用 message-service feign 接口
        return ApiResponse.success(null);
    }

    @Operation(summary = "系统管理 - 获取配置")
    @GetMapping("/system/config")
    public ApiResponse<Object> getSystemConfig() {
        return ApiResponse.success("system config data");
    }
}
