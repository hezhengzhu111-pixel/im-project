package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.entity.UserSession;
import com.im.service.IImService;
import com.im.service.route.UserRouteRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LocalRouteLeaseRenewTaskTest {

    @Mock
    private IImService imService;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private UserRouteRegistry routeRegistry;

    private LocalRouteLeaseRenewTask task;

    @BeforeEach
    void setUp() {
        task = new LocalRouteLeaseRenewTask(imService, nodeIdentity, routeRegistry);
        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
    }

    @Test
    void renewLeases_shouldRefreshRouteEntryTtlWithInstanceSessionCount() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of("1", "2"));
        when(imService.getLocalSessions("1")).thenReturn(List.of(UserSession.builder().build(), UserSession.builder().build()));
        when(imService.getLocalSessions("2")).thenReturn(List.of(UserSession.builder().build()));

        task.renewLeases();

        verify(routeRegistry).renewLocalRoute("1", "im-node-1", 2);
        verify(routeRegistry).renewLocalRoute("2", "im-node-1", 1);
    }

    @Test
    void renewLeases_shouldSkipWhenNoLocalUsers() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of());

        task.renewLeases();

        verify(routeRegistry, never()).renewLocalRoute(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void renewLeases_shouldSkipUsersWithoutActiveLocalSessions() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of("1"));
        when(imService.getLocalSessions("1")).thenReturn(List.of());

        task.renewLeases();

        verify(routeRegistry, never()).renewLocalRoute(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyInt());
    }
}
