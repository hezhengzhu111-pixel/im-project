package com.im.util;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

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
}
