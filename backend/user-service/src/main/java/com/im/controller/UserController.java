package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.UserAuthResponseDTO;
import com.im.dto.UserDTO;
import com.im.feign.AuthServiceFeignClient;
import com.im.dto.request.BindEmailRequest;
import com.im.dto.request.BindPhoneRequest;
import com.im.dto.request.ChangePasswordRequest;
import com.im.dto.request.DeleteAccountRequest;
import com.im.dto.request.SendCodeRequest;
import com.im.dto.request.LoginRequest;
import com.im.dto.UserSettingsDTO;
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
@RequestMapping("/user")
@RequiredArgsConstructor
@Validated
@Slf4j
@Tag(name = "User Management", description = "用户管理接口")
public class UserController {

    private final UserService userService;

    private final ImService imService;

    private final AuthServiceFeignClient authServiceFeignClient;

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
    public ApiResponse<UserAuthResponseDTO> login(@RequestBody @Validated LoginRequest loginRequest) {
        log.info("Login request received: username={}", loginRequest == null ? null : loginRequest.getUsername());

        // 判断登录方式
        if (loginRequest.getPassword() != null && !loginRequest.getPassword().trim().isEmpty()) {
            // 用户名+密码登录
            return ApiResponse.success(userService.loginWithPassword(loginRequest.getUsername(), loginRequest.getPassword()));
        } else if (loginRequest.getToken() != null && !loginRequest.getToken().trim().isEmpty()) {
            // 用户名+token登录
            return ApiResponse.success(userService.loginWithToken(loginRequest.getUsername(), loginRequest.getToken()));
        } else {
            throw new com.im.exception.BusinessException("请提供密码或token进行登录");
        }
    }

    /**
     * 修改用户信息
     * PUT /user/profile
     */
    @PutMapping("/profile")
    @Operation(summary = "修改用户信息", description = "更新用户个人资料")
    public ApiResponse<Boolean> updateProfile(@RequestAttribute("userId") Long userId, @RequestBody @Validated(UpdateGroup.class) UserDTO userDTO) {
        return ApiResponse.success(userService.updateProfile(userId, userDTO));
    }

    /**
     * 用户下线
     */
    @PostMapping("/offline")
    @Operation(summary = "用户下线", description = "用户主动下线")
    public ApiResponse<String> userOffline(@RequestAttribute("userId") Long userId) {
        return userLogout(userId);
    }

    @PostMapping("/logout")
    @Operation(summary = "用户登出", description = "撤销用户令牌并下线")
    public ApiResponse<String> userLogout(@RequestAttribute("userId") Long userId) {
        try {
            authServiceFeignClient.revokeUserTokens(userId);
            imService.userOffline(userId.toString());
            return ApiResponse.success("用户登出成功", "用户登出成功");
        } catch (Exception e) {
            log.error("用户登出失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }

    /**
     * 用户上线
     */
    @PostMapping("/online")
    @Operation(summary = "用户上线", description = "用户上线")
    public ApiResponse<String> userOnline(@RequestAttribute("userId") Long userId) {
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
    @Operation(summary = "心跳检测", description = "刷新当前用户心跳并可选查询在线状态")
    public ApiResponse<Map<String, Boolean>> heartbeat(
            @RequestAttribute("userId") Long userId,
            @RequestBody(required = false) List<String> userIds) {
        try {
            boolean touched = imService.touchHeartbeat(String.valueOf(userId));
            if (!touched) {
                return ApiResponse.badRequest("当前用户不在线或会话已失效");
            }
            if (userIds == null || userIds.isEmpty()) {
                return ApiResponse.success("心跳刷新成功", Map.of(String.valueOf(userId), true));
            }
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

    @PutMapping("/password")
    @Operation(summary = "修改密码", description = "修改用户密码")
    public ApiResponse<Boolean> changePassword(@RequestAttribute("userId") Long userId, @RequestBody @Validated ChangePasswordRequest request) {
        return ApiResponse.success(userService.changePassword(userId, request.getCurrentPassword(), request.getNewPassword()));
    }

    @PostMapping("/phone/code")
    @Operation(summary = "发送手机验证码", description = "发送手机验证码")
    public ApiResponse<String> sendPhoneCode(@RequestBody @Validated SendCodeRequest request) {
        userService.sendVerificationCode(request.getTarget());
        return ApiResponse.success("验证码已发送", null);
    }

    @PostMapping("/phone/bind")
    @Operation(summary = "绑定手机号", description = "验证并绑定手机号")
    public ApiResponse<Boolean> bindPhone(@RequestAttribute("userId") Long userId, @RequestBody @Validated BindPhoneRequest request) {
        return ApiResponse.success(userService.bindPhone(userId, request.getPhone(), request.getCode()));
    }

    @PostMapping("/email/code")
    @Operation(summary = "发送邮箱验证码", description = "发送邮箱验证码")
    public ApiResponse<String> sendEmailCode(@RequestBody @Validated SendCodeRequest request) {
        userService.sendVerificationCode(request.getTarget());
        return ApiResponse.success("验证码已发送", null);
    }

    @PostMapping("/email/bind")
    @Operation(summary = "绑定邮箱", description = "验证并绑定邮箱")
    public ApiResponse<Boolean> bindEmail(@RequestAttribute("userId") Long userId, @RequestBody @Validated BindEmailRequest request) {
        return ApiResponse.success(userService.bindEmail(userId, request.getEmail(), request.getCode()));
    }

    @DeleteMapping("/account")
    @Operation(summary = "注销账户", description = "验证密码后注销账户")
    public ApiResponse<Boolean> deleteAccount(@RequestAttribute("userId") Long userId, @RequestBody @Validated DeleteAccountRequest request) {
        return ApiResponse.success(userService.deleteAccount(userId, request.getPassword()));
    }

    @GetMapping("/settings")
    @Operation(summary = "获取用户设置", description = "获取用户的隐私、消息、通用设置")
    public ApiResponse<UserSettingsDTO> getUserSettings(@RequestAttribute("userId") Long userId) {
        return ApiResponse.success(userService.getUserSettings(userId));
    }

    @PutMapping("/settings/{type}")
    @Operation(summary = "更新用户设置", description = "更新指定类型的用户设置(privacy, message, general)")
    public ApiResponse<Boolean> updateUserSettings(
            @RequestAttribute("userId") Long userId,
            @PathVariable("type") String type,
            @RequestBody Map<String, Object> settings) {
        return ApiResponse.success(userService.updateUserSettings(userId, type, settings));
    }
}
