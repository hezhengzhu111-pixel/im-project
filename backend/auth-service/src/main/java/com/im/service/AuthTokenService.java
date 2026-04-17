package com.im.service;

import com.im.dto.*;
import com.im.dto.request.RefreshTokenRequest;
import com.im.metrics.AuthServiceMetrics;
import com.im.util.TokenParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthTokenService {

    private static final String REFRESH_JTI_KEY_PREFIX = "auth:refresh:jti:";
    private static final String PREVIOUS_REFRESH_KEY_PREFIX = "auth:refresh:previous:";
    private static final String REFRESH_LOCK_KEY_PREFIX = "auth:refresh:lock:";
    private static final String WS_TICKET_KEY_PREFIX = "auth:ws:ticket:";
    private static final long REFRESH_RESULT_POLL_INTERVAL_MS = 25L;
    private static final RedisScript<Long> REFRESH_ROTATE_COMMIT_SCRIPT = new DefaultRedisScript<>(
            """
                    redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
                    redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[4])
                    return 1
                    """,
            Long.class
    );
    private static final RedisScript<Long> REFRESH_LOCK_RELEASE_SCRIPT = new DefaultRedisScript<>(
            """
                    if redis.call('GET', KEYS[1]) == ARGV[1] then
                      return redis.call('DEL', KEYS[1])
                    end
                    return 0
                    """,
            Long.class
    );
    private static final RedisScript<String> WS_TICKET_CONSUME_SCRIPT = new DefaultRedisScript<>(
            """
                    local payload = redis.call('GET', KEYS[1])
                    if not payload then
                      return nil
                    end
                    redis.call('DEL', KEYS[1])
                    return payload
                    """,
            String.class
    );

    private final StringRedisTemplate stringRedisTemplate;
    private final AuthUserResourceService authUserResourceService;
    private final TokenParser tokenParser;

    @Autowired(required = false)
    private AuthServiceMetrics metrics;

    @Value("${jwt.secret}")
    private String accessSecret;

    @Value("${jwt.expiration:86400000}")
    private long accessExpirationMs;

    @Value("${auth.refresh.secret}")
    private String refreshSecret;

    @Value("${auth.refresh.expiration:604800000}")
    private long refreshExpirationMs;

    @Value("${auth.refresh.previous-grace-seconds:10}")
    private long previousRefreshGraceSeconds;

    @Value("${auth.refresh.lock-seconds:5}")
    private long refreshLockSeconds;

    @Value("${auth.ws-ticket.ttl-seconds:30}")
    private long wsTicketTtlSeconds;

    public TokenPairDTO issueTokenPair(Long userId, String username) {
        TokenPairBundle tokenPairBundle = buildTokenPair(userId, username);
        storeRefreshJti(userId, tokenPairBundle.refreshJti());
        authUserResourceService.getOrLoad(userId);
        return tokenPairBundle.tokenPair();
    }

    private TokenPairBundle buildTokenPair(Long userId, String username) {
        if (userId == null || username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("userId/username不能为空");
        }

        String accessJti = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();

        String accessToken = buildToken(accessSecret, accessExpirationMs, userId, username, "access", accessJti);
        String refreshToken = buildToken(refreshSecret, refreshExpirationMs, userId, username, "refresh", refreshJti);

        TokenPairDTO dto = new TokenPairDTO();
        dto.setAccessToken(accessToken);
        dto.setRefreshToken(refreshToken);
        dto.setExpiresInMs(accessExpirationMs);
        dto.setRefreshExpiresInMs(refreshExpirationMs);
        return new TokenPairBundle(refreshJti, dto);
    }

    public WsTicketDTO issueWsTicket(Long userId, String username) {
        if (userId == null) {
            throw new IllegalArgumentException("userId不能为空");
        }
        String normalizedUsername = resolveWsTicketUsername(userId, username);
        String ticket = UUID.randomUUID().toString();
        String key = WS_TICKET_KEY_PREFIX + ticket;
        String value = userId + "\n" + normalizedUsername;
        stringRedisTemplate.opsForValue().set(key, value, Duration.ofSeconds(wsTicketTtlSeconds));
        return WsTicketDTO.builder()
                .ticket(ticket)
                .expiresInMs(Duration.ofSeconds(wsTicketTtlSeconds).toMillis())
                .build();
    }

    public WsTicketConsumeResultDTO consumeWsTicket(String ticket, Long expectedUserId) {
        if (ticket == null || ticket.trim().isEmpty()) {
            recordWsTicketConsumeResult("invalid");
            return invalidWsTicket("ticket不能为空");
        }
        if (expectedUserId == null) {
            recordWsTicketConsumeResult("invalid");
            return invalidWsTicket("userId不能为空");
        }
        String payload = consumeWsTicketPayload(ticket.trim());
        if (payload == null || payload.isBlank()) {
            recordWsTicketConsumeResult("expired_or_missing");
            return invalidWsTicket("ticket无效或已过期");
        }
        WsTicketPayload parsed = parseWsTicketPayload(payload);
        if (parsed == null) {
            recordWsTicketConsumeResult("invalid");
            return invalidWsTicket("ticket数据无效");
        }
        if (!expectedUserId.equals(parsed.userId())) {
            recordWsTicketConsumeResult("invalid");
            return WsTicketConsumeResultDTO.builder()
                    .valid(false)
                    .status(WsTicketConsumeResultDTO.STATUS_USER_MISMATCH)
                    .userId(parsed.userId())
                    .username(parsed.username())
                    .error("ticket与userId不匹配")
                    .build();
        }
        recordWsTicketConsumeResult("success");
        return WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(parsed.userId())
                .username(parsed.username())
                .build();
    }

    public TokenPairDTO refresh(RefreshTokenRequest request) {
        RefreshRequestInput input = refreshInput(request);
        RefreshTokenProcessContext context = refreshProcess(input);
        try {
            return refreshOutput(context);
        } finally {
            releaseRefreshLock(context.userId(), context.refreshJti(), context.lockOwner());
        }
    }

    public TokenParseResultDTO parseAccessToken(String token, boolean allowExpired) {
        TokenParser.TokenParseInfo info = tokenParser.parseAccessToken(token);
        return convertToResultDTO(info, allowExpired);
    }

    public TokenParseResultDTO parseRefreshToken(String token, boolean allowExpired) {
        TokenParser.TokenParseInfo info = tokenParser.parseRefreshToken(token);
        return convertToResultDTO(info, allowExpired);
    }

    private TokenParseResultDTO convertToResultDTO(TokenParser.TokenParseInfo info, boolean allowExpired) {
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(info.isValid());
        result.setExpired(info.isExpired());
        result.setError(info.getError());
        result.setUserId(info.getUserId());
        result.setUsername(info.getUsername());
        result.setTokenType(info.getTokenType());
        result.setJti(info.getJti());
        result.setIssuedAtEpochMs(info.getIssuedAtEpochMs());
        result.setExpiresAtEpochMs(info.getExpiresAtEpochMs());
        if (result.isValid() && !result.isExpired() && result.getUserId() != null) {
            try {
                AuthUserResourceDTO resource = authUserResourceService.getOrLoad(result.getUserId());
                result.setPermissions(resource == null ? null : resource.getResourcePermissions());
            } catch (Exception e) {
                log.debug("load token permissions failed, userId={}", result.getUserId(), e);
            }
        }

        if (!allowExpired && result.isExpired()) {
            result.setUserId(null);
            result.setUsername(null);
            result.setIssuedAtEpochMs(null);
            result.setExpiresAtEpochMs(null);
            result.setJti(null);
            result.setTokenType(null);
        }
        
        return result;
    }

    private void storeRefreshJti(Long userId, String refreshJti) {
        stringRedisTemplate.opsForValue().set(REFRESH_JTI_KEY_PREFIX + userId, refreshJti, Duration.ofMillis(refreshExpirationMs));
    }

    private String serializeTokenPairPayload(TokenPairDTO dto) {
        if (dto == null) {
            return null;
        }
        return String.join("\n",
                safe(dto.getAccessToken()),
                safe(dto.getRefreshToken()),
                String.valueOf(dto.getExpiresInMs() == null ? 0L : dto.getExpiresInMs()),
                String.valueOf(dto.getRefreshExpiresInMs() == null ? 0L : dto.getRefreshExpiresInMs())
        );
    }

    private Duration previousRefreshResultTtl() {
        return Duration.ofSeconds(Math.max(1L, Math.max(previousRefreshGraceSeconds, refreshLockSeconds)));
    }

    private TokenPairDTO readPreviousRefreshResult(Long userId, String refreshJti) {
        if (userId == null || refreshJti == null || refreshJti.isBlank()) {
            return null;
        }
        String payload = stringRedisTemplate.opsForValue().get(PREVIOUS_REFRESH_KEY_PREFIX + userId + ":" + refreshJti);
        if (payload == null || payload.isBlank()) {
            return null;
        }
        String[] parts = payload.split("\\n", -1);
        if (parts.length < 4 || parts[0].isBlank() || parts[1].isBlank()) {
            return null;
        }
        TokenPairDTO dto = new TokenPairDTO();
        dto.setAccessToken(parts[0]);
        dto.setRefreshToken(parts[1]);
        dto.setExpiresInMs(parseLong(parts[2], accessExpirationMs));
        dto.setRefreshExpiresInMs(parseLong(parts[3], refreshExpirationMs));
        return dto;
    }

    private RefreshRequestInput refreshInput(RefreshTokenRequest request) {
        if (request == null || request.getRefreshToken() == null || request.getRefreshToken().trim().isEmpty()) {
            throw new IllegalArgumentException("refreshToken不能为空");
        }
        return new RefreshRequestInput(request.getRefreshToken(), request.getAccessToken());
    }

    private RefreshTokenProcessContext refreshProcess(RefreshRequestInput input) {
        TokenParser.TokenParseInfo refreshParsed = tokenParser.parseRefreshToken(input.refreshToken());
        validateRefreshParsed(refreshParsed);

        Long userId = refreshParsed.getUserId();
        String username = refreshParsed.getUsername();
        String refreshJti = refreshParsed.getJti();
        if (userId == null || username == null || refreshJti == null) {
            throw new SecurityException("refreshToken解析失败");
        }

        validateAccessTokenMatch(input.accessToken(), userId, username);
        String storedJti = stringRedisTemplate.opsForValue().get(REFRESH_JTI_KEY_PREFIX + userId);
        if (storedJti != null && storedJti.equals(refreshJti)) {
            String lockOwner = tryAcquireRefreshLock(userId, refreshJti);
            if (lockOwner != null) {
                return new RefreshTokenProcessContext(userId, username, refreshJti, null, lockOwner);
            }
            RefreshWaitOutcome waitOutcome = waitForPreviousRefreshResult(userId, refreshJti);
            if (waitOutcome.previousResult() != null) {
                return new RefreshTokenProcessContext(userId, username, refreshJti, waitOutcome.previousResult(), null);
            }
            if (waitOutcome.lockOwner() != null) {
                return new RefreshTokenProcessContext(userId, username, refreshJti, null, waitOutcome.lockOwner());
            }
            throw new SecurityException("refreshToken正在刷新，请重试");
        }
        TokenPairDTO previousResult = readPreviousRefreshResult(userId, refreshJti);
        if (previousResult != null) {
            return new RefreshTokenProcessContext(userId, username, refreshJti, previousResult, null);
        }
        throw new SecurityException("refreshToken已失效");
    }

    private TokenPairDTO refreshOutput(RefreshTokenProcessContext context) {
        if (context.previousResult() != null) {
            return context.previousResult();
        }
        return rotateRefreshTokenPair(context.userId(), context.username(), context.refreshJti());
    }

    private String tryAcquireRefreshLock(Long userId, String refreshJti) {
        String lockOwner = UUID.randomUUID().toString();
        Boolean acquired = stringRedisTemplate.opsForValue().setIfAbsent(
                refreshLockKey(userId, refreshJti),
                lockOwner,
                refreshLockDuration()
        );
        return Boolean.TRUE.equals(acquired) ? lockOwner : null;
    }

    private RefreshWaitOutcome waitForPreviousRefreshResult(Long userId, String refreshJti) {
        long deadlineNanos = System.nanoTime() + refreshLockDuration().toNanos();
        while (true) {
            TokenPairDTO previous = readPreviousRefreshResult(userId, refreshJti);
            if (previous != null) {
                return new RefreshWaitOutcome(previous, null);
            }

            String storedJti = readStoredRefreshJti(userId);
            if (!refreshJti.equals(storedJti)) {
                return new RefreshWaitOutcome(readPreviousRefreshResult(userId, refreshJti), null);
            }

            String currentLockOwner = readRefreshLockOwner(userId, refreshJti);
            if (currentLockOwner == null || currentLockOwner.isBlank()) {
                String nextLockOwner = tryAcquireRefreshLock(userId, refreshJti);
                if (nextLockOwner != null) {
                    return new RefreshWaitOutcome(null, nextLockOwner);
                }
            }

            long remainingNanos = deadlineNanos - System.nanoTime();
            if (remainingNanos <= 0L) {
                break;
            }
            if (!sleepForRefreshResult(Math.min(Duration.ofNanos(remainingNanos).toMillis(), REFRESH_RESULT_POLL_INTERVAL_MS))) {
                return new RefreshWaitOutcome(null, null);
            }
        }

        TokenPairDTO previous = readPreviousRefreshResult(userId, refreshJti);
        if (previous != null) {
            return new RefreshWaitOutcome(previous, null);
        }
        if (refreshJti.equals(readStoredRefreshJti(userId))) {
            String currentLockOwner = readRefreshLockOwner(userId, refreshJti);
            if (currentLockOwner == null || currentLockOwner.isBlank()) {
                String nextLockOwner = tryAcquireRefreshLock(userId, refreshJti);
                if (nextLockOwner != null) {
                    return new RefreshWaitOutcome(null, nextLockOwner);
                }
            }
        }
        return new RefreshWaitOutcome(null, null);
    }

    private TokenPairDTO rotateRefreshTokenPair(Long userId, String username, String previousRefreshJti) {
        TokenPairBundle tokenPairBundle = buildTokenPair(userId, username);
        authUserResourceService.getOrLoad(userId);
        commitRefreshRotation(userId, previousRefreshJti, tokenPairBundle.refreshJti(), tokenPairBundle.tokenPair());
        return tokenPairBundle.tokenPair();
    }

    private void commitRefreshRotation(Long userId, String previousRefreshJti, String refreshJti, TokenPairDTO dto) {
        stringRedisTemplate.execute(
                REFRESH_ROTATE_COMMIT_SCRIPT,
                List.of(refreshJtiKey(userId), previousRefreshResultKey(userId, previousRefreshJti)),
                refreshJti,
                String.valueOf(refreshExpirationMs),
                serializeTokenPairPayload(dto),
                String.valueOf(previousRefreshResultTtl().toMillis())
        );
    }

    private void releaseRefreshLock(Long userId, String refreshJti, String lockOwner) {
        if (userId == null || refreshJti == null || refreshJti.isBlank() || lockOwner == null || lockOwner.isBlank()) {
            return;
        }
        stringRedisTemplate.execute(
                REFRESH_LOCK_RELEASE_SCRIPT,
                List.of(refreshLockKey(userId, refreshJti)),
                lockOwner
        );
    }

    private String readStoredRefreshJti(Long userId) {
        if (userId == null) {
            return null;
        }
        return stringRedisTemplate.opsForValue().get(refreshJtiKey(userId));
    }

    private String readRefreshLockOwner(Long userId, String refreshJti) {
        if (userId == null || refreshJti == null || refreshJti.isBlank()) {
            return null;
        }
        return stringRedisTemplate.opsForValue().get(refreshLockKey(userId, refreshJti));
    }

    private Duration refreshLockDuration() {
        return Duration.ofSeconds(Math.max(1L, refreshLockSeconds));
    }

    private boolean sleepForRefreshResult(long sleepMs) {
        try {
            Thread.sleep(Math.max(1L, sleepMs));
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private String refreshJtiKey(Long userId) {
        return REFRESH_JTI_KEY_PREFIX + userId;
    }

    private String previousRefreshResultKey(Long userId, String refreshJti) {
        return PREVIOUS_REFRESH_KEY_PREFIX + userId + ":" + refreshJti;
    }

    private String refreshLockKey(Long userId, String refreshJti) {
        return REFRESH_LOCK_KEY_PREFIX + userId + ":" + refreshJti;
    }

    private void validateRefreshParsed(TokenParser.TokenParseInfo refreshParsed) {
        if (refreshParsed.isExpired()) {
            throw new SecurityException("refreshToken已过期");
        }
        if (!refreshParsed.isValid()) {
            throw new SecurityException(refreshParsed.getError() == null ? "refreshToken无效" : refreshParsed.getError());
        }
        if (!"refresh".equals(refreshParsed.getTokenType())) {
            throw new SecurityException("token类型错误");
        }
    }

    private void validateAccessTokenMatch(String accessToken, Long userId, String username) {
        if (accessToken == null || accessToken.trim().isEmpty()) {
            return;
        }
        TokenParser.TokenParseInfo accessParsed = tokenParser.parseAccessToken(accessToken);
        if (accessParsed.getUserId() != null && !userId.equals(accessParsed.getUserId())) {
            throw new SecurityException("accessToken与refreshToken不匹配");
        }
        if (accessParsed.getUsername() != null && !username.equals(accessParsed.getUsername())) {
            throw new SecurityException("accessToken与refreshToken不匹配");
        }
    }

    private String buildToken(String secret, long expirationMs, Long userId, String username, String typ, String jti) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expirationMs);
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        claims.put("typ", typ);
        claims.put("jti", jti);
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(exp)
                .signWith(getSigningKey(secret), SignatureAlgorithm.HS512)
                .compact();
    }

    private SecretKey getSigningKey(String secret) {
        return getSecretKey(secret);
    }

    @NonNull
    public static SecretKey getSecretKey(String secret) {
        String effectiveSecret = secret == null ? "" : secret;
        byte[] keyBytes = effectiveSecret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length >= 64) {
            return Keys.hmacShaKeyFor(keyBytes);
        }
        byte[] padded = new byte[64];
        for (int i = 0; i < padded.length; i++) {
            padded[i] = keyBytes[i % Math.max(1, keyBytes.length)];
        }
        return Keys.hmacShaKeyFor(padded);
    }

    private String normalizeBearer(String token) {
        String t = token.trim();
        if (t.startsWith("Bearer ")) {
            t = t.substring("Bearer ".length()).trim();
        }
        return t;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private Long parseLong(String value, Long fallback) {
        try {
            return Long.valueOf(value);
        } catch (Exception e) {
            return fallback;
        }
    }

    private String consumeWsTicketPayload(String ticket) {
        return stringRedisTemplate.execute(
                WS_TICKET_CONSUME_SCRIPT,
                List.of(WS_TICKET_KEY_PREFIX + ticket)
        );
    }

    private WsTicketConsumeResultDTO invalidWsTicket(String error) {
        return WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_INVALID)
                .error(error)
                .build();
    }

    private void recordWsTicketConsumeResult(String result) {
        if (metrics != null) {
            metrics.recordWsTicketConsumeResult(result);
        }
    }

    private String resolveWsTicketUsername(Long userId, String username) {
        String normalized = normalizeUsername(username);
        if (normalized != null) {
            return normalized;
        }

        try {
            AuthUserResourceDTO resource = authUserResourceService.getOrLoad(userId);
            if (resource != null) {
                normalized = normalizeUsername(resource.getUsername());
                if (normalized != null) {
                    return normalized;
                }
                normalized = normalizeUsername(resolveUsernameFromUserInfo(resource.getUserInfo()));
                if (normalized != null) {
                    return normalized;
                }
            }
        } catch (Exception e) {
            log.debug("ws-ticket用户名回填失败，userId={}", userId, e);
        }
        return "user-" + userId;
    }

    private String resolveUsernameFromUserInfo(Map<String, Object> userInfo) {
        if (userInfo == null) {
            return null;
        }
        Object username = userInfo.get("username");
        return username == null ? null : username.toString();
    }

    private String normalizeUsername(String username) {
        if (username == null) {
            return null;
        }
        String trimmed = username.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private WsTicketPayload parseWsTicketPayload(String payload) {
        String[] parts = payload.split("\\n", 2);
        if (parts.length != 2) {
            return null;
        }
        try {
            return new WsTicketPayload(Long.valueOf(parts[0].trim()), parts[1].trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private record RefreshRequestInput(String refreshToken, String accessToken) {
    }

    private record RefreshTokenProcessContext(Long userId, String username, String refreshJti, TokenPairDTO previousResult, String lockOwner) {
    }

    private record RefreshWaitOutcome(TokenPairDTO previousResult, String lockOwner) {
    }

    private record TokenPairBundle(String refreshJti, TokenPairDTO tokenPair) {
    }

    private record WsTicketPayload(Long userId, String username) {
    }
}
