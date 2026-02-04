package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.UserAuthResponseDTO;
import com.im.dto.UserDTO;
import com.im.dto.request.LoginRequest;
import com.im.service.ImService;
import com.im.service.UserService;
import com.im.validation.group.RegisterGroup;
import com.im.validation.group.UpdateGroup;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/")
@RequiredArgsConstructor
@Validated
@Slf4j
@Tag(name = "User Management", description = "用户管理接口")
public class UserController {

    private final UserService userService;

    private final ImService imService;

    /**
     * 用户注册（开放注册）
     * POST /user/register
     */
    @PostMapping("/register")
    @Operation(summary = "用户注册", description = "开放用户注册接口")
    public ApiResponse<UserDTO> register(@RequestBody @Validated(RegisterGroup.class) UserDTO userDTO) {

        return ApiResponse.success(userService.register(userDTO));
    }

    /**
     * 用户登录
     * POST /user/login
     * 支持两种登录方式：
     * 1. username + password
     * 2. username + token
     */
    @PostMapping("/login")
    @Operation(summary = "用户登录", description = "支持密码或Token登录")
    public UserAuthResponseDTO login(@RequestBody @Validated LoginRequest loginRequest) {
        log.info("Login request received: username={}", loginRequest == null ? null : loginRequest.getUsername());

        // 判断登录方式
        if (loginRequest.getPassword() != null && !loginRequest.getPassword().trim().isEmpty()) {
            // 用户名+密码登录
            return userService.loginWithPassword(loginRequest.getUsername(), loginRequest.getPassword());
        } else if (loginRequest.getToken() != null && !loginRequest.getToken().trim().isEmpty()) {
            // 用户名+token登录
            return userService.loginWithToken(loginRequest.getUsername(), loginRequest.getToken());
        } else {
            return UserAuthResponseDTO.error("请提供密码或token进行登录");
        }
    }

    /**
     * 修改用户信息
     * PUT /user/profile
     */
    @PutMapping("/profile")
    @Operation(summary = "修改用户信息", description = "更新用户个人资料")
    public ApiResponse<Boolean> updateProfile(@RequestAttribute Long userId, @RequestBody @Validated(UpdateGroup.class) UserDTO userDTO) {
        return ApiResponse.success(userService.updateProfile(userId, userDTO));
    }

    /**
     * 用户下线
     */
    @PostMapping("/offline")
    @Operation(summary = "用户下线", description = "用户主动下线")
    public ApiResponse<String> userOffline(@RequestAttribute Long userId) {
        try {
            imService.userOffline(userId.toString());
            return ApiResponse.success("用户下线成功", "用户下线成功");
        } catch (Exception e) {
            log.error("用户下线失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }

    /**
     * 用户上线
     */
    @PostMapping("/online")
    @Operation(summary = "用户上线", description = "用户上线")
    public ApiResponse<String> userOnline(@RequestAttribute Long userId) {
        try {
            imService.userOnline(userId.toString());
            return ApiResponse.success("用户上线成功", "用户上线成功");
        } catch (Exception e) {
            log.error("用户上线失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }

    /**
     * 心跳检测
     */
    @PostMapping("/heartbeat")
    @Operation(summary = "心跳检测", description = "批量检测用户在线状态")
    public ApiResponse<Map<String, Boolean>> heartbeat(@RequestBody @NotEmpty(message = "用户ID列表不能为空") List<String> userIds) {
        try {
            Map<String, Boolean> onlineStatus = imService.checkUsersOnlineStatus(userIds);
            return ApiResponse.success("心跳检测成功", onlineStatus);
        } catch (Exception e) {
            log.error("心跳检测失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }

    /**
     * 检查用户在线状态
     */
    @PostMapping("/online-status")
    @Operation(summary = "检查在线状态", description = "检查指定用户列表的在线状态")
    public ApiResponse<Map<String, Boolean>> checkUsersOnlineStatus(
            @RequestBody @NotEmpty(message = "用户ID列表不能为空") List<String> userIds) {
        try {
            Map<String, Boolean> onlineStatus = imService.checkUsersOnlineStatus(userIds);
            return ApiResponse.success("检查用户在线状态成功", onlineStatus);
        } catch (Exception e) {
            log.error("检查用户在线状态失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 搜索用户
     */
    @GetMapping("/search")
    @Operation(summary = "搜索用户", description = "根据用户名或关键词搜索用户")
    public ApiResponse<List<UserDTO>> searchUsers(
            @RequestParam(value = "type", defaultValue = "username") String searchType,
            @RequestParam("keyword") String keyword) {
        try {
            List<UserDTO> users = userService.searchUsers(searchType, keyword);
            return ApiResponse.success("搜索用户成功", users);
        } catch (Exception e) {
            log.error("搜索用户失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
}
