package com.im.service;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.PermissionCheckResultDTO;
import com.im.dto.request.CheckPermissionRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthPermissionService {

    private final AuthUserResourceService authUserResourceService;

    public PermissionCheckResultDTO checkPermission(CheckPermissionRequest request) {
        PermissionCheckResultDTO result = new PermissionCheckResultDTO();
        result.setUserId(request.getUserId());
        result.setPermission(request.getPermission());
        result.setResource(request.getResource());
        result.setAction(request.getAction());

        if (request.getUserId() == null) {
            result.setGranted(false);
            result.setReason("用户ID不能为空");
            return result;
        }

        try {
            AuthUserResourceDTO userResource = authUserResourceService.getOrLoad(request.getUserId());
            if (userResource == null) {
                result.setGranted(false);
                result.setReason("用户资源信息不存在");
                return result;
            }

            List<String> permissions = userResource.getResourcePermissions();
            if (permissions == null || permissions.isEmpty()) {
                result.setGranted(false);
                result.setReason("用户没有任何权限");
                return result;
            }

            boolean hasPermission = checkPermission(permissions, request);
            result.setGranted(hasPermission);
            result.setReason(hasPermission ? "权限验证通过" : "权限不足");
            return result;
        } catch (Exception e) {
            log.error("检查权限失败，userId={}, permission={}", request.getUserId(), request.getPermission(), e);
            result.setGranted(false);
            result.setReason("权限检查失败：" + e.getMessage());
            return result;
        }
    }

    public boolean hasDataScope(Long userId, String scopeKey, Object scopeValue) {
        if (userId == null) {
            return false;
        }

        try {
            AuthUserResourceDTO userResource = authUserResourceService.getOrLoad(userId);
            if (userResource == null) {
                return false;
            }

            Map<String, Object> dataScopes = userResource.getDataScopes();
            if (dataScopes == null || dataScopes.isEmpty()) {
                return false;
            }

            Object value = dataScopes.get(scopeKey);
            if (value == null) {
                return false;
            }

            if (value instanceof List) {
                List<?> list = (List<?>) value;
                return list.contains(scopeValue);
            } else {
                return value.equals(scopeValue);
            }
        } catch (Exception e) {
            log.error("检查数据范围失败，userId={}, scopeKey={}", userId, scopeKey, e);
            return false;
        }
    }

    private boolean checkPermission(List<String> permissions, CheckPermissionRequest request) {
        String permission = request.getPermission();
        String resource = request.getResource();
        String action = request.getAction();

        if (permission != null && !permission.isEmpty()) {
            if (permissions.contains("*") || permissions.contains("admin")) {
                return true;
            }
            if (permissions.contains(permission)) {
                return true;
            }
        }

        if (resource != null && action != null) {
            String resourceAction = resource + ":" + action;
            if (permissions.contains("*") || permissions.contains("admin")) {
                return true;
            }
            if (permissions.contains(resourceAction)) {
                return true;
            }
            if (permissions.contains(resource + ":*")) {
                return true;
            }
        }

        return false;
    }
}
