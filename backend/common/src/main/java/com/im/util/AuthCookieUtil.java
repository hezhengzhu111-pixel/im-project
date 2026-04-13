package com.im.util;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

import java.util.Locale;

public final class AuthCookieUtil {

    private AuthCookieUtil() {
    }

    public static String getCookieValue(HttpServletRequest request, String cookieName) {
        if (request == null || cookieName == null || cookieName.isBlank()) {
            return null;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (cookie != null && cookieName.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public static ResponseCookie buildTokenCookie(
            String cookieName,
            String value,
            long maxAgeSeconds,
            boolean secure,
            String sameSite
    ) {
        return ResponseCookie.from(cookieName, value == null ? "" : value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(sameSite == null || sameSite.isBlank() ? "Lax" : sameSite)
                .path("/")
                .maxAge(maxAgeSeconds)
                .build();
    }

    public static ResponseCookie clearCookie(String cookieName, boolean secure, String sameSite) {
        return buildTokenCookie(cookieName, "", 0, secure, sameSite);
    }

    public static boolean resolveSecure(HttpServletRequest request, String secureMode) {
        String mode = secureMode == null || secureMode.isBlank()
                ? "auto"
                : secureMode.trim().toLowerCase(Locale.ROOT);
        if ("true".equals(mode) || "always".equals(mode)) {
            return true;
        }
        if ("false".equals(mode) || "never".equals(mode)) {
            return false;
        }
        if (request == null) {
            return false;
        }
        if (request.isSecure()) {
            return true;
        }
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        if (forwardedProto != null && forwardedProto.toLowerCase(Locale.ROOT).contains("https")) {
            return true;
        }
        String forwarded = request.getHeader("Forwarded");
        return forwarded != null && forwarded.toLowerCase(Locale.ROOT).contains("proto=https");
    }
}
