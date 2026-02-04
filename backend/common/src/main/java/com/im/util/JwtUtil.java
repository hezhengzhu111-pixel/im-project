package com.im.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class JwtUtil {

    private static final Logger logger = LoggerFactory.getLogger(JwtUtil.class);

    @Value("${jwt.secret:im-backend-secret-key-for-jwt-token-generation}")
    private String secret;

    @Value("${jwt.expiration:86400000}")
    private Long expiration;

    @Value("${jwt.header:Authorization}")
    private String header;

    @Value("${jwt.prefix:Bearer }")
    private String prefix;

    public String generateToken(Long userId, String username) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        return createToken(claims, username);
    }

    public String generateToken(Long userId, String username, Map<String, Object> extraClaims) {
        Map<String, Object> claims = new HashMap<>(extraClaims);
        claims.put("userId", userId);
        claims.put("username", username);
        return createToken(claims, username);
    }

    public String getUsernameFromToken(String token) {
        return getClaimFromToken(token, Claims::getSubject);
    }

    public Long getUserIdFromToken(String token) {
        Claims claims = getAllClaimsFromToken(token);
        Object userId = claims.get("userId");
        if (userId instanceof Integer) {
            return ((Integer) userId).longValue();
        } else if (userId instanceof Long) {
            return (Long) userId;
        } else if (userId instanceof String) {
            return Long.valueOf((String) userId);
        }
        return null;
    }

    public Date getExpirationDateFromToken(String token) {
        return getClaimFromToken(token, Claims::getExpiration);
    }

    public <T> T getClaimFromToken(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = getAllClaimsFromToken(token);
        return claimsResolver.apply(claims);
    }

    public Claims getAllClaimsFromToken(String token) {
        try {
            token = normalizeToken(token);
            return Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (Exception e) {
            logger.error("解析JWT令牌失败: {}", e.getMessage());
            throw new RuntimeException("无效的JWT令牌", e);
        }
    }

    public Boolean isTokenExpired(String token) {
        try {
            final Date expiration = getExpirationDateFromToken(token);
            return expiration.before(new Date());
        } catch (Exception e) {
            logger.error("检查令牌过期状态失败: {}", e.getMessage());
            return true;
        }
    }

    public Boolean validateToken(String token) {
        try {
            if (token == null || token.trim().isEmpty()) {
                return false;
            }
            token = normalizeToken(token);
            
            Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(token);
            
            return !isTokenExpired(token);
        } catch (ExpiredJwtException e) {
            logger.warn("JWT令牌已过期: {}", e.getMessage());
            return false;
        } catch (UnsupportedJwtException e) {
            logger.warn("不支持的JWT令牌: {}", e.getMessage());
            return false;
        } catch (MalformedJwtException e) {
            logger.warn("格式错误的JWT令牌: {}", e.getMessage());
            return false;
        } catch (SecurityException e) {
            logger.warn("JWT令牌签名验证失败: {}", e.getMessage());
            return false;
        } catch (IllegalArgumentException e) {
            logger.warn("JWT令牌参数错误: {}", e.getMessage());
            return false;
        } catch (Exception e) {
            logger.error("验证JWT令牌时发生未知错误: {}", e.getMessage());
            return false;
        }
    }

    public Boolean validateToken(String token, String username) {
        try {
            final String tokenUsername = getUsernameFromToken(token);
            return (username.equals(tokenUsername) && !isTokenExpired(token));
        } catch (Exception e) {
            logger.error("验证JWT令牌失败: {}", e.getMessage());
            return false;
        }
    }

    public String refreshToken(String token) {
        try {
            final Claims claims = getAllClaimsFromToken(token);
            final String username = claims.getSubject();
            final Long userId = getUserIdFromToken(token);
            return generateToken(userId, username);
        } catch (Exception e) {
            logger.error("刷新JWT令牌失败: {}", e.getMessage());
            throw new RuntimeException("无法刷新令牌", e);
        }
    }

    public String extractTokenFromHeader(String authHeader) {
        return normalizeToken(authHeader);
    }

    public Long getRemainingTime(String token) {
        try {
            Date expiration = getExpirationDateFromToken(token);
            return expiration.getTime() - System.currentTimeMillis();
        } catch (Exception e) {
            logger.error("获取令牌剩余时间失败: {}", e.getMessage());
            return 0L;
        }
    }

    private String createToken(Map<String, Object> claims, String subject) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);
        
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS512)
                .compact();
    }

    private SecretKey getSigningKey() {
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

    private String normalizeToken(String token) {
        if (token == null) {
            return null;
        }
        String normalized = token.trim();
        if (normalized.startsWith(prefix)) {
            normalized = normalized.substring(prefix.length()).trim();
        }
        return normalized.isEmpty() ? null : normalized;
    }

    public String getHeader() {
        return header;
    }

    public String getPrefix() {
        return prefix;
    }

    public Long getExpiration() {
        return expiration;
    }
}
