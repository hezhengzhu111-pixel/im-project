package com.im.service;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.PermissionCheckResultDTO;
import com.im.dto.request.CheckPermissionRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthPermissionServiceTest {

    @Mock
    private AuthUserResourceService authUserResourceService;

    private AuthPermissionService service;

    @BeforeEach
    void setUp() {
        service = new AuthPermissionService(authUserResourceService);
    }

    @Test
    void checkPermissionShouldGrantByExactPermission() {
        CheckPermissionRequest request = request(1001L, "group:read", null, null);
        when(authUserResourceService.getOrLoad(1001L))
                .thenReturn(userResource(List.of("group:read"), Map.of()));

        PermissionCheckResultDTO result = service.checkPermission(request);

        assertTrue(result.isGranted());
        assertEquals("权限验证通过", result.getReason());
    }

    @Test
    void checkPermissionShouldGrantByResourceWildcard() {
        CheckPermissionRequest request = request(1002L, null, "message", "delete");
        when(authUserResourceService.getOrLoad(1002L))
                .thenReturn(userResource(List.of("message:*"), Map.of()));

        PermissionCheckResultDTO result = service.checkPermission(request);

        assertTrue(result.isGranted());
        assertEquals("权限验证通过", result.getReason());
    }

    @Test
    void checkPermissionShouldDenyWhenUserHasNoPermissions() {
        CheckPermissionRequest request = request(1003L, "user:write", null, null);
        when(authUserResourceService.getOrLoad(1003L))
                .thenReturn(userResource(List.of(), Map.of()));

        PermissionCheckResultDTO result = service.checkPermission(request);

        assertFalse(result.isGranted());
        assertEquals("用户没有任何权限", result.getReason());
    }

    @Test
    void hasDataScopeShouldMatchListValue() {
        when(authUserResourceService.getOrLoad(1004L))
                .thenReturn(userResource(List.of(), Map.of("tenantIds", List.of(1, 2, 3))));

        boolean result = service.hasDataScope(1004L, "tenantIds", 2);

        assertTrue(result);
    }

    @Test
    void hasDataScopeShouldReturnFalseWhenScopeNotMatched() {
        when(authUserResourceService.getOrLoad(1005L))
                .thenReturn(userResource(List.of(), Map.of("deptId", 11)));

        boolean result = service.hasDataScope(1005L, "deptId", 12);

        assertFalse(result);
    }

    @Test
    void checkPermissionShouldReturnFailureWhenServiceThrows() {
        CheckPermissionRequest request = request(1006L, "user:read", null, null);
        when(authUserResourceService.getOrLoad(1006L))
                .thenThrow(new IllegalStateException("redis down"));

        PermissionCheckResultDTO result = service.checkPermission(request);

        assertFalse(result.isGranted());
        assertEquals("权限检查失败：redis down", result.getReason());
    }

    private CheckPermissionRequest request(Long userId, String permission, String resource, String action) {
        CheckPermissionRequest request = new CheckPermissionRequest();
        request.setUserId(userId);
        request.setPermission(permission);
        request.setResource(resource);
        request.setAction(action);
        return request;
    }

    private AuthUserResourceDTO userResource(List<String> permissions, Map<String, Object> dataScopes) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(1L);
        dto.setResourcePermissions(permissions);
        dto.setDataScopes(dataScopes);
        dto.setUserInfo(Map.of());
        return dto;
    }
}
