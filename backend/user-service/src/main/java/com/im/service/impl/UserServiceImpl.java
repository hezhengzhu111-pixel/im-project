package com.im.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.UserAuthResponseDTO;
import com.im.dto.UserDTO;
import com.im.entity.User;
import com.im.exception.BusinessException;
import com.im.feign.AuthServiceFeignClient;
import com.im.mapper.UserMapper;
import com.im.service.UserService;
import com.im.util.DTOConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final DTOConverter dtoConverter;
    private final AuthServiceFeignClient authServiceFeignClient;

    @Override
    @Transactional
    public UserDTO register(UserDTO userDTO) {
        Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, userDTO.getUsername()));
        if (existing != null && existing > 0) {
            throw new BusinessException("用户名已存在");
        }

        User user = new User();
        user.setUsername(userDTO.getUsername());
        user.setPassword(BCrypt.hashpw(userDTO.getPassword(), BCrypt.gensalt()));
        user.setNickname(userDTO.getNickname() != null ? userDTO.getNickname() : userDTO.getUsername());
        user.setEmail(userDTO.getEmail());
        user.setPhone(userDTO.getPhone());
        user.setStatus(1);

        try {
            userMapper.insert(user);
            User savedUser = user;
            UserDTO result = dtoConverter.toUserDTO(savedUser);
            log.info("用户注册成功: userId={}, username={}", savedUser.getId(), savedUser.getUsername());
            return result;
        } catch (Exception e) {
            log.error("用户注册失败: username={}", userDTO == null ? null : userDTO.getUsername(), e);
            throw new BusinessException("注册失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional
    public UserAuthResponseDTO loginWithPassword(String username, String password) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username)
                .eq(User::getStatus, 1));
        if (user == null) {
            throw new BusinessException("用户不存在或已被禁用");
        }

        if (!BCrypt.checkpw(password, user.getPassword())) {
            throw new BusinessException("密码错误");
        }

        return buildLoginResult(user);
    }

    @Override
    public UserAuthResponseDTO loginWithToken(String username, String token) {
        TokenParseResultDTO result = authServiceFeignClient.validateToken(token);
        if (result == null || !result.isValid() || result.isExpired()) {
            throw new BusinessException("Token无效或已过期");
        }

        if (!username.equals(result.getUsername())) {
            throw new BusinessException("Token与用户名不匹配");
        }

        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username)
                .eq(User::getStatus, 1));
        if (user == null) {
            throw new BusinessException("用户不存在或已被禁用");
        }

        return buildLoginResult(user);
    }

    private UserAuthResponseDTO buildLoginResult(User user) {
        com.im.dto.request.IssueTokenRequest req = new com.im.dto.request.IssueTokenRequest();
        req.setUserId(user.getId());
        req.setUsername(user.getUsername());
        req.setNickname(user.getNickname());
        req.setAvatar(user.getAvatar());
        req.setEmail(user.getEmail());
        req.setPhone(user.getPhone());
        var tokenPair = authServiceFeignClient.issueToken(req);

        updateLastLoginTime(user.getId());

        UserDTO userDTO = dtoConverter.toUserDTO(user);

        log.info("用户登录成功: userId={}, username={}", user.getId(), user.getUsername());
        return UserAuthResponseDTO.success(userDTO, tokenPair.getAccessToken(), tokenPair.getRefreshToken(), tokenPair.getExpiresInMs(), tokenPair.getRefreshExpiresInMs());
    }

    @Override
    public User findById(Long userId) {
        return userMapper.selectById(userId);
    }

    @Override
    public boolean validateToken(String token) {
        try {
            TokenParseResultDTO result = authServiceFeignClient.validateToken(token);
            return result != null && result.isValid() && !result.isExpired();
        } catch (Exception e) {
            log.error("验证Token失败", e);
            return false;
        }
    }

    @Override
    public Long getUserIdFromToken(String token) {
        try {
            TokenParseResultDTO result = authServiceFeignClient.validateToken(token);
            if (result != null && result.isValid() && !result.isExpired()) {
                return result.getUserId();
            }
            return null;
        } catch (Exception e) {
            log.error("从Token获取用户ID失败", e);
            return null;
        }
    }

    @Override
    public String getUsernameFromToken(String token) {
        try {
            TokenParseResultDTO result = authServiceFeignClient.validateToken(token);
            if (result != null && result.isValid() && !result.isExpired()) {
                return result.getUsername();
            }
            return null;
        } catch (Exception e) {
            log.error("从Token获取用户名失败", e);
            return null;
        }
    }

    @Override
    @Transactional
    public void updateLastLoginTime(Long userId) {
        userMapper.update(null, new LambdaUpdateWrapper<User>()
                .eq(User::getId, userId)
                .set(User::getLastLoginTime, LocalDateTime.now()));
    }

    @Override
    public Boolean updateProfile(Long userId, UserDTO userDTO) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return false;
        }
        if (userDTO.getNickname() != null && !userDTO.getNickname().trim().isEmpty()) {
            user.setNickname(userDTO.getNickname());
        }
        if (userDTO.getAvatar() != null && !userDTO.getAvatar().trim().isEmpty()) {
            user.setAvatar(userDTO.getAvatar());
        }
        if (userDTO.getEmail() != null && !userDTO.getEmail().trim().isEmpty()) {
            user.setEmail(userDTO.getEmail());
        }
        if (userDTO.getPhone() != null && !userDTO.getPhone().trim().isEmpty()) {
            user.setPhone(userDTO.getPhone());
        }
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        return true;
    }

    @Override
    public List<UserDTO> searchUsersByUsername(String username) {
        List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
                .like(User::getUsername, username));
        return users.stream()
                .map(dtoConverter::toUserDTO)
                .collect(Collectors.toList());
    }

    @Override
    public List<UserDTO> searchUsers(String searchType, String keyword) {
        List<User> users;
        switch (searchType) {
            case "email":
                users = userMapper.selectList(new LambdaQueryWrapper<User>()
                        .like(User::getEmail, keyword));
                break;
            case "phone":
                users = userMapper.selectList(new LambdaQueryWrapper<User>()
                        .like(User::getPhone, keyword));
                break;
            case "username":
            default:
                users = userMapper.selectList(new LambdaQueryWrapper<User>()
                        .like(User::getUsername, keyword));
                break;
        }
        return users.stream()
                .map(dtoConverter::toUserDTO)
                .collect(Collectors.toList());
    }

    private String generateIMToken(String username) {
        return "im_token_" + username + "_" + System.currentTimeMillis();
    }
}
