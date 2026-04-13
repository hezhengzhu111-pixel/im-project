package com.im.util;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

public final class AuthContextUtil {

    private AuthContextUtil() {
    }

    public static Long getUserId() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return null;
        }
        Object userId = request.getAttribute("userId");
        if (userId instanceof Long) {
            return (Long) userId;
        }
        if (userId instanceof String) {
            try {
                return Long.valueOf((String) userId);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    public static String getUsername() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return null;
        }
        Object username = request.getAttribute("username");
        return username == null ? null : String.valueOf(username);
    }

    public static Object getAuthUserInfo() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : request.getAttribute("authUserInfo");
    }

    public static Object getAuthPermissions() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : request.getAttribute("authPermissions");
    }

    public static List<String> getPermissionList() {
        Object permissions = getAuthPermissions();
        if (permissions instanceof Collection<?> collection) {
            return collection.stream()
                    .map(item -> item == null ? "" : String.valueOf(item).trim())
                    .filter(item -> !item.isEmpty())
                    .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    public static boolean hasPermission(String permission) {
        if (permission == null || permission.isBlank()) {
            return true;
        }
        List<String> permissions = getPermissionList();
        String normalized = permission.trim();
        return permissions.contains("*")
                || permissions.contains("admin")
                || permissions.contains(normalized);
    }

    public static boolean hasAnyPermission(String... requiredPermissions) {
        if (requiredPermissions == null || requiredPermissions.length == 0) {
            return true;
        }
        for (String permission : requiredPermissions) {
            if (hasPermission(permission)) {
                return true;
            }
        }
        return false;
    }

    public static Object getAuthDataScopes() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : request.getAttribute("authDataScopes");
    }

    private static HttpServletRequest currentRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes) {
            return ((ServletRequestAttributes) attrs).getRequest();
        }
        return null;
    }
}
