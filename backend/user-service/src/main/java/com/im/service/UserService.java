package com.im.service;

import com.im.dto.UserDTO;
import com.im.entity.User;
import com.im.dto.UserAuthResponseDTO;

import java.util.List;

public interface UserService {
    
    /**
     * 用户注册（开放注册）
     */
    UserDTO register(UserDTO userDTO);

    
    /**
     * 用户登录（用户名+密码）
     */
    UserAuthResponseDTO loginWithPassword(String username, String password);
    
    /**
     * 用户登录（用户名+token）
     */
    UserAuthResponseDTO loginWithToken(String username, String token);
    
    /**
     * 根据ID查找用户
     */
    User findById(Long userId);
    
    /**
     * 根据用户名搜索用户
     */
    List<UserDTO> searchUsersByUsername(String username);

    /**
     * 根据搜索类型和关键词搜索用户
     * @param searchType 搜索类型：username, email, phone
     * @param keyword 搜索关键词
     * @return 用户列表
     */
    List<UserDTO> searchUsers(String searchType, String keyword);
    
    /**
     * 验证JWT Token
     */
    boolean validateToken(String token);
    
    /**
     * 从Token中获取用户ID
     */
    Long getUserIdFromToken(String token);
    
    /**
     * 从Token中获取用户名
     */
    String getUsernameFromToken(String token);
    
    /**
     * 更新用户最后登录时间
     */
    void updateLastLoginTime(Long userId);

    /**
     * 修改用户信息
     * @param userId 用户ID
     * @param userDTO 用户信息
     * @return 修改结果
     */
    Boolean updateProfile(Long userId, UserDTO userDTO);

    /**
     * 修改密码
     */
    Boolean changePassword(Long userId, String currentPassword, String newPassword);

    /**
     * 发送验证码（手机/邮箱）
     */
    void sendVerificationCode(String target);

    /**
     * 绑定手机号
     */
    Boolean bindPhone(Long userId, String phone, String code);

    /**
     * 绑定邮箱
     */
    Boolean bindEmail(Long userId, String email, String code);

    /**
     * 注销账户
     */
    Boolean deleteAccount(Long userId, String password);

    /**
     * 获取用户设置
     */
    com.im.dto.UserSettingsDTO getUserSettings(Long userId);

    /**
     * 更新用户设置（全量/部分）
     */
    Boolean updateUserSettings(Long userId, String type, java.util.Map<String, Object> settings);
}