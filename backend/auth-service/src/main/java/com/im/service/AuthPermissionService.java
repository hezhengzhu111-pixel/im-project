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
        PermissionCheckInput input = permissionCheckInput(request);
        if (input.userId() == null) {
            return permissionCheckOutput(input, false, "用户ID不能为空");
        }
        try {
            PermissionCheckProcessResult processResult = permissionCheckProcess(input);
            return permissionCheckOutput(input, processResult.granted(), processResult.reason());
        } catch (Exception e) {
            log.warn("检查权限失败，userId={}, permission={}, reason={}",
                    input.userId(), input.permission(), e.getMessage());
            log.debug("检查权限失败详情，userId={}, permission={}", input.userId(), input.permission(), e);
            return permissionCheckOutput(input, false, "权限检查失败：" + e.getMessage());
        }
    }

    public boolean hasDataScope(Long userId, String scopeKey, Object scopeValue) {
        DataScopeInput input = dataScopeInput(userId, scopeKey, scopeValue);
        if (input.userId() == null) {
            return false;
        }
        try {
            return hasDataScopeProcess(input);
        } catch (Exception e) {
            log.warn("检查数据范围失败，userId={}, scopeKey={}, reason={}",
                    input.userId(), input.scopeKey(), e.getMessage());
            log.debug("检查数据范围失败详情，userId={}, scopeKey={}", input.userId(), input.scopeKey(), e);
            return false;
        }
    }

    private PermissionCheckInput permissionCheckInput(CheckPermissionRequest request) {
        if (request == null) {
            return new PermissionCheckInput(null, null, null, null);
        }
        return new PermissionCheckInput(
                request.getUserId(),
                request.getPermission(),
                request.getResource(),
                request.getAction()
        );
    }

    private PermissionCheckProcessResult permissionCheckProcess(PermissionCheckInput input) {
        AuthUserResourceDTO userResource = authUserResourceService.getOrLoad(input.userId());
        if (userResource == null) {
            return new PermissionCheckProcessResult(false, "用户资源信息不存在");
        }
        List<String> permissions = userResource.getResourcePermissions();
        if (permissions == null || permissions.isEmpty()) {
            return new PermissionCheckProcessResult(false, "用户没有任何权限");
        }
        boolean granted = checkPermissionProcess(permissions, input);
        return new PermissionCheckProcessResult(granted, granted ? "权限验证通过" : "权限不足");
    }

    private PermissionCheckResultDTO permissionCheckOutput(PermissionCheckInput input, boolean granted, String reason) {
        PermissionCheckResultDTO result = new PermissionCheckResultDTO();
        result.setUserId(input.userId());
        result.setPermission(input.permission());
        result.setResource(input.resource());
        result.setAction(input.action());
        result.setGranted(granted);
        result.setReason(reason);
        return result;
    }

    private DataScopeInput dataScopeInput(Long userId, String scopeKey, Object scopeValue) {
        return new DataScopeInput(userId, scopeKey, scopeValue);
    }

    private boolean hasDataScopeProcess(DataScopeInput input) {
        AuthUserResourceDTO userResource = authUserResourceService.getOrLoad(input.userId());
        if (userResource == null) {
            return false;
        }
        Map<String, Object> dataScopes = userResource.getDataScopes();
        if (dataScopes == null || dataScopes.isEmpty()) {
            return false;
        }
        Object value = dataScopes.get(input.scopeKey());
        return matchDataScope(value, input.scopeValue());
    }

    private boolean matchDataScope(Object configuredValue, Object expectedValue) {
        if (configuredValue == null) {
            return false;
        }
        if (configuredValue instanceof List<?> list) {
            return list.contains(expectedValue);
        }
        return configuredValue.equals(expectedValue);
    }

    private boolean checkPermissionProcess(List<String> permissions, PermissionCheckInput input) {
        if (hasGlobalPermission(permissions)) {
            return true;
        }
        if (hasExactPermission(permissions, input.permission())) {
            return true;
        }
        return hasResourcePermission(permissions, input.resource(), input.action());
    }

    private boolean hasGlobalPermission(List<String> permissions) {
        return permissions.contains("*") || permissions.contains("admin");
    }

    private boolean hasExactPermission(List<String> permissions, String permission) {
        if (isBlank(permission)) {
            return false;
        }
        return permissions.contains(permission);
    }

    private boolean hasResourcePermission(List<String> permissions, String resource, String action) {
        if (isBlank(resource) || isBlank(action)) {
            return false;
        }
        String resourceAction = resource + ":" + action;
        return permissions.contains(resourceAction) || permissions.contains(resource + ":*");
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record PermissionCheckInput(Long userId, String permission, String resource, String action) {
    }

    private record PermissionCheckProcessResult(boolean granted, String reason) {
    }

    private record DataScopeInput(Long userId, String scopeKey, Object scopeValue) {
    }
}
