package com.im.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.UserAuthResponseDTO;
import com.im.dto.UserDTO;
import com.im.user.entity.User;
import com.im.exception.BusinessException;
import com.im.feign.AuthServiceFeignClient;
import com.im.mapper.UserMapper;
import com.im.mapper.UserSettingsMapper;
import com.im.service.UserService;
import com.im.util.DTOConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.UserSettingsDTO;
import com.im.user.entity.UserSettings;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final UserSettingsMapper userSettingsMapper;
    private final DTOConverter dtoConverter;
    private final AuthServiceFeignClient authServiceFeignClient;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final String VERIFY_CODE_PREFIX = "im:verify:code:";
    private static final String LOGIN_FAIL_PREFIX = "im:login:fail:";
    private static final String VERIFY_RATE_PREFIX = "im:verify:rate:";
    private static final String GENERIC_LOGIN_ERROR = "用户名或密码错误";
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_]{3,20}$");
    private static final Pattern PASSWORD_PATTERN = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{8,64}$");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int MAX_LOGIN_FAILURES = 5;
    private static final int MAX_VERIFY_PER_MINUTE = 3;
    private static final int MAX_VERIFY_PER_DAY = 20;
    private static final long LOGIN_LOCK_MINUTES = 15L;

    @Override
    @Transactional
    public UserDTO register(UserDTO userDTO) {
        if (userDTO == null) {
            throw new BusinessException("注册信息不能为空");
        }
        String username = normalizeUsername(userDTO.getUsername());
        validateUsername(username);
        validatePassword(userDTO.getPassword());
        String email = normalizeOptional(userDTO.getEmail());
        String phone = normalizeOptional(userDTO.getPhone());

        Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username));
        if (existing != null && existing > 0) {
            throw new BusinessException("用户名已存在");
        }
        ensureEmailAvailable(null, email);
        ensurePhoneAvailable(null, phone);

        User user = new User();
        user.setUsername(username);
        user.setPassword(BCrypt.hashpw(userDTO.getPassword(), BCrypt.gensalt()));
        user.setNickname(normalizeOptional(userDTO.getNickname()) != null ? userDTO.getNickname().trim() : username);
        user.setEmail(email);
        user.setPhone(phone);
        user.setStatus(1);

        try {
            userMapper.insert(user);
            User savedUser = user;
            UserDTO result = dtoConverter.toUserDTO(savedUser);
            log.info("用户注册成功: userId={}, username={}", savedUser.getId(), savedUser.getUsername());
            return result;
        } catch (DataIntegrityViolationException e) {
            log.warn("用户注册唯一约束冲突: username={}", username);
            throw new BusinessException("用户名已存在");
        } catch (Exception e) {
            log.error("用户注册失败: username={}", username, e);
            throw new BusinessException("注册失败，请稍后重试");
        }
    }

    @Override
    @Transactional
    public UserAuthResponseDTO loginWithPassword(String username, String password) {
        String normalizedUsername = normalizeUsername(username);
        assertLoginNotLimited(normalizedUsername);
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, normalizedUsername)
                .eq(User::getStatus, 1));
        if (user == null) {
            recordLoginFailure(normalizedUsername);
            throw new BusinessException(GENERIC_LOGIN_ERROR);
        }

        if (password == null || !BCrypt.checkpw(password, user.getPassword())) {
            recordLoginFailure(normalizedUsername);
            throw new BusinessException(GENERIC_LOGIN_ERROR);
        }

        clearLoginFailures(normalizedUsername);
        return buildLoginResult(user);
    }

    @Override
    public UserAuthResponseDTO loginWithToken(String username, String token) {
        String normalizedUsername = normalizeUsername(username);
        TokenParseResultDTO result = authServiceFeignClient.validateToken(token);
        if (result == null || !result.isValid() || result.isExpired()) {
            throw new BusinessException("Token无效或已过期");
        }

        if (!normalizedUsername.equals(normalizeUsername(result.getUsername()))) {
            throw new BusinessException("Token与用户名不匹配");
        }

        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, normalizedUsername)
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
        AuthUserResourceDTO resource = authServiceFeignClient.getUserResource(user.getId());

        updateLastLoginTime(user.getId());

        UserDTO userDTO = dtoConverter.toUserDTO(user);

        log.info("用户登录成功: userId={}, username={}", user.getId(), user.getUsername());
        UserAuthResponseDTO response = UserAuthResponseDTO.success(
                userDTO,
                tokenPair.getAccessToken(),
                tokenPair.getRefreshToken(),
                tokenPair.getExpiresInMs(),
                tokenPair.getRefreshExpiresInMs()
        );
        response.setPermissions(resource == null ? java.util.Collections.emptyList() : resource.getResourcePermissions());
        return response;
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
        String email = normalizeOptional(userDTO.getEmail());
        if (email != null) {
            ensureEmailAvailable(userId, email);
            user.setEmail(email);
        }
        String phone = normalizeOptional(userDTO.getPhone());
        if (phone != null) {
            ensurePhoneAvailable(userId, phone);
            user.setPhone(phone);
        }
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        return true;
    }

    @Override
    public List<UserDTO> searchUsersByUsername(String username) {
        String keyword = normalizeSearchKeyword(username);
        List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
                .like(User::getUsername, keyword));
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
                        .like(User::getEmail, normalizeSearchKeyword(keyword)));
                break;
            case "phone":
                users = userMapper.selectList(new LambdaQueryWrapper<User>()
                        .like(User::getPhone, normalizeSearchKeyword(keyword)));
                break;
            case "username":
            default:
                users = userMapper.selectList(new LambdaQueryWrapper<User>()
                        .like(User::getUsername, normalizeUsername(keyword)));
                break;
        }
        return users.stream()
                .map(dtoConverter::toUserDTO)
                .collect(Collectors.toList());
    }

    @Override
    public Boolean changePassword(Long userId, String currentPassword, String newPassword) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        if (!BCrypt.checkpw(currentPassword, user.getPassword())) {
            throw new BusinessException("原密码错误");
        }
        validatePassword(newPassword);
        user.setPassword(BCrypt.hashpw(newPassword, BCrypt.gensalt()));
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        authServiceFeignClient.revokeUserTokens(userId);
        return true;
    }

    @Override
    public void sendVerificationCode(String target) {
        String normalizedTarget = normalizeOptional(target);
        if (normalizedTarget == null) {
            throw new BusinessException("验证码目标不能为空");
        }
        assertVerificationNotLimited(normalizedTarget);
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        redisTemplate.opsForValue().set(VERIFY_CODE_PREFIX + normalizedTarget, code, 5, TimeUnit.MINUTES);
        log.info("【模拟发送】向 {} 发送了验证码: ******", normalizedTarget);
    }

    @Override
    public Boolean bindPhone(Long userId, String phone, String code) {
        String normalizedPhone = normalizeOptional(phone);
        if (normalizedPhone == null) {
            throw new BusinessException("手机号不能为空");
        }
        String key = VERIFY_CODE_PREFIX + normalizedPhone;
        String cachedCode = redisTemplate.opsForValue().get(key);
        if (cachedCode == null || !cachedCode.equals(code)) {
            throw new BusinessException("验证码错误或已过期");
        }
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        ensurePhoneAvailable(userId, normalizedPhone);
        user.setPhone(normalizedPhone);
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        redisTemplate.delete(key);
        return true;
    }

    @Override
    public Boolean bindEmail(Long userId, String email, String code) {
        String normalizedEmail = normalizeOptional(email);
        if (normalizedEmail == null) {
            throw new BusinessException("邮箱不能为空");
        }
        String key = VERIFY_CODE_PREFIX + normalizedEmail;
        String cachedCode = redisTemplate.opsForValue().get(key);
        if (cachedCode == null || !cachedCode.equals(code)) {
            throw new BusinessException("验证码错误或已过期");
        }
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        ensureEmailAvailable(userId, normalizedEmail);
        user.setEmail(normalizedEmail);
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        redisTemplate.delete(key);
        return true;
    }

    @Override
    @Transactional
    public Boolean deleteAccount(Long userId, String password) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        if (!BCrypt.checkpw(password, user.getPassword())) {
            throw new BusinessException("密码错误");
        }
        user.setStatus(0); // 禁用
        user.setUpdatedTime(LocalDateTime.now());
        userMapper.updateById(user);
        try {
            authServiceFeignClient.revokeUserTokens(userId);
        } catch (Exception e) {
            log.error("注销时撤销Token失败", e);
        }
        return true;
    }

    @Override
    public UserSettingsDTO getUserSettings(Long userId) {
        UserSettings userSettings = userSettingsMapper.selectById(userId);
        UserSettingsDTO dto = new UserSettingsDTO();
        if (userSettings == null) {
            return dto;
        }
        try {
            if (userSettings.getPrivacySettings() != null) {
                dto.setPrivacy(objectMapper.readValue(userSettings.getPrivacySettings(), Map.class));
            }
            if (userSettings.getMessageSettings() != null) {
                dto.setMessage(objectMapper.readValue(userSettings.getMessageSettings(), Map.class));
            }
            if (userSettings.getGeneralSettings() != null) {
                dto.setGeneral(objectMapper.readValue(userSettings.getGeneralSettings(), Map.class));
            }
        } catch (Exception e) {
            log.error("解析用户设置JSON失败", e);
        }
        return dto;
    }

    @Override
    @Transactional
    public Boolean updateUserSettings(Long userId, String type, Map<String, Object> settings) {
        UserSettings userSettings = userSettingsMapper.selectById(userId);
        if (userSettings == null) {
            userSettings = new UserSettings();
            userSettings.setUserId(userId);
            userSettings.setCreatedTime(LocalDateTime.now());
            userSettingsMapper.insert(userSettings);
        }
        try {
            String json = objectMapper.writeValueAsString(settings);
            switch (type) {
                case "privacy":
                    userSettings.setPrivacySettings(json);
                    break;
                case "message":
                    userSettings.setMessageSettings(json);
                    break;
                case "general":
                    userSettings.setGeneralSettings(json);
                    break;
                default:
                    throw new BusinessException("未知的设置类型");
            }
            userSettings.setUpdatedTime(LocalDateTime.now());
            userSettingsMapper.updateById(userSettings);
            return true;
        } catch (Exception e) {
            log.error("更新用户设置失败", e);
            throw new BusinessException("更新设置失败");
        }
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed.toLowerCase(Locale.ROOT);
    }

    private String normalizeSearchKeyword(String value) {
        String normalized = normalizeOptional(value);
        return normalized == null ? "" : normalized;
    }

    private void validateUsername(String username) {
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            throw new BusinessException("用户名只能包含3-20位字母、数字和下划线");
        }
    }

    private void validatePassword(String password) {
        if (password == null || !PASSWORD_PATTERN.matcher(password).matches()) {
            throw new BusinessException("密码需为8-64位，且包含字母和数字");
        }
    }

    private void assertLoginNotLimited(String username) {
        try {
            String key = loginFailKey(username);
            String raw = redisTemplate.opsForValue().get(key);
            long failures = raw == null ? 0L : Long.parseLong(raw);
            if (failures >= MAX_LOGIN_FAILURES) {
                throw new BusinessException("登录失败次数过多，请稍后再试");
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("读取登录限流状态失败: username={}", username, e);
        }
    }

    private void recordLoginFailure(String username) {
        try {
            String key = loginFailKey(username);
            Long count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redisTemplate.expire(key, LOGIN_LOCK_MINUTES, TimeUnit.MINUTES);
            }
        } catch (Exception e) {
            log.warn("记录登录失败限流失败: username={}", username, e);
        }
    }

    private void clearLoginFailures(String username) {
        try {
            redisTemplate.delete(loginFailKey(username));
        } catch (Exception e) {
            log.warn("清理登录限流状态失败: username={}", username, e);
        }
    }

    private String loginFailKey(String username) {
        return LOGIN_FAIL_PREFIX + currentClientIp() + ":" + username;
    }

    private void assertVerificationNotLimited(String target) {
        try {
            String ip = currentClientIp();
            String minuteKey = VERIFY_RATE_PREFIX + "minute:" + ip + ":" + target;
            String dayKey = VERIFY_RATE_PREFIX + "day:" + ip + ":" + target;
            Long minuteCount = redisTemplate.opsForValue().increment(minuteKey);
            if (minuteCount != null && minuteCount == 1L) {
                redisTemplate.expire(minuteKey, 1, TimeUnit.MINUTES);
            }
            Long dayCount = redisTemplate.opsForValue().increment(dayKey);
            if (dayCount != null && dayCount == 1L) {
                redisTemplate.expire(dayKey, 1, TimeUnit.DAYS);
            }
            if ((minuteCount != null && minuteCount > MAX_VERIFY_PER_MINUTE)
                    || (dayCount != null && dayCount > MAX_VERIFY_PER_DAY)) {
                throw new BusinessException("验证码发送过于频繁，请稍后再试");
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("验证码限流检查失败: target={}", target, e);
        }
    }

    private String currentClientIp() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servletAttributes)) {
            return "unknown";
        }
        HttpServletRequest request = servletAttributes.getRequest();
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",", 2)[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private void ensureEmailAvailable(Long userId, String email) {
        if (email == null) {
            return;
        }
        Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getEmail, email)
                .ne(userId != null, User::getId, userId));
        if (existing != null && existing > 0) {
            throw new BusinessException("邮箱已被绑定");
        }
    }

    private void ensurePhoneAvailable(Long userId, String phone) {
        if (phone == null) {
            return;
        }
        Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getPhone, phone)
                .ne(userId != null, User::getId, userId));
        if (existing != null && existing > 0) {
            throw new BusinessException("手机号已被绑定");
        }
    }

    private String generateIMToken(String username) {
        return "im_token_" + username + "_" + System.currentTimeMillis();
    }
}
