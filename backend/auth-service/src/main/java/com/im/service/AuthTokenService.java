package com.im.service;

import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.request.RefreshTokenRequest;
import com.im.util.TokenParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthTokenService {

    private static final String REFRESH_JTI_KEY_PREFIX = "auth:refresh:jti:";
    private static final String WS_TICKET_KEY_PREFIX = "auth:ws:ticket:";

    private final StringRedisTemplate stringRedisTemplate;
    private final AuthUserResourceService authUserResourceService;
    private final TokenParser tokenParser;

    @Value("${jwt.secret}")
    private String accessSecret;

    @Value("${jwt.expiration:86400000}")
    private long accessExpirationMs;

    @Value("${auth.refresh.secret}")
    private String refreshSecret;

    @Value("${auth.refresh.expiration:604800000}")
    private long refreshExpirationMs;

    @Value("${auth.ws-ticket.ttl-seconds:30}")
    private long wsTicketTtlSeconds;

    public TokenPairDTO issueTokenPair(Long userId, String username) {
        if (userId == null || username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("userId/username不能为空");
        }

        String accessJti = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();

        String accessToken = buildToken(accessSecret, accessExpirationMs, userId, username, "access", accessJti);
        String refreshToken = buildToken(refreshSecret, refreshExpirationMs, userId, username, "refresh", refreshJti);

        storeRefreshJti(userId, refreshJti);
        authUserResourceService.getOrLoad(userId);

        TokenPairDTO dto = new TokenPairDTO();
        dto.setAccessToken(accessToken);
        dto.setRefreshToken(refreshToken);
        dto.setExpiresInMs(accessExpirationMs);
        dto.setRefreshExpiresInMs(refreshExpirationMs);
        return dto;
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
            return invalidWsTicket("ticket不能为空");
        }
        if (expectedUserId == null) {
            return invalidWsTicket("userId不能为空");
        }
        String payload = stringRedisTemplate.opsForValue().getAndDelete(WS_TICKET_KEY_PREFIX + ticket.trim());
        if (payload == null || payload.isBlank()) {
            return invalidWsTicket("ticket无效或已过期");
        }
        WsTicketPayload parsed = parseWsTicketPayload(payload);
        if (parsed == null) {
            return invalidWsTicket("ticket数据无效");
        }
        if (!expectedUserId.equals(parsed.userId())) {
            return WsTicketConsumeResultDTO.builder()
                    .valid(false)
                    .userId(parsed.userId())
                    .username(parsed.username())
                    .error("ticket与userId不匹配")
                    .build();
        }
        return WsTicketConsumeResultDTO.builder()
                .valid(true)
                .userId(parsed.userId())
                .username(parsed.username())
                .build();
    }

    public TokenPairDTO refresh(RefreshTokenRequest request) {
        RefreshRequestInput input = refreshInput(request);
        RefreshTokenProcessContext context = refreshProcess(input);
        return refreshOutput(context);
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

        validateStoredRefreshJti(userId, refreshJti);
        validateAccessTokenMatch(input.accessToken(), userId, username);
        return new RefreshTokenProcessContext(userId, username);
    }

    private TokenPairDTO refreshOutput(RefreshTokenProcessContext context) {
        return issueTokenPair(context.userId(), context.username());
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

    private void validateStoredRefreshJti(Long userId, String refreshJti) {
        String storedJti = stringRedisTemplate.opsForValue().get(REFRESH_JTI_KEY_PREFIX + userId);
        if (storedJti == null || !storedJti.equals(refreshJti)) {
            throw new SecurityException("refreshToken已失效");
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

    private WsTicketConsumeResultDTO invalidWsTicket(String error) {
        return WsTicketConsumeResultDTO.builder()
                .valid(false)
                .error(error)
                .build();
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

    private record RefreshTokenProcessContext(Long userId, String username) {
    }

    private record WsTicketPayload(Long userId, String username) {
    }
}
