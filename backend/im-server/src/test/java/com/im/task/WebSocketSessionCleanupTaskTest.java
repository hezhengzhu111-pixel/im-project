package com.im.task;

import com.im.entity.UserSession;
import com.im.service.IImService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketSessionCleanupTaskTest {

    @Mock
    private IImService imService;

    private WebSocketSessionCleanupTask task;

    @BeforeEach
    void setUp() {
        task = new WebSocketSessionCleanupTask(imService);
    }

    @Test
    void cleanupInactiveSessions_shouldUnregisterZombieSessionWithoutTouchingHealthySession() {
        Map<String, UserSession> sessionsById = new LinkedHashMap<>();
        sessionsById.put("zombie-session", UserSession.builder()
                .userId("1")
                .lastHeartbeat(LocalDateTime.now())
                .build());
        sessionsById.put("healthy-session", UserSession.builder()
                .userId("2")
                .lastHeartbeat(LocalDateTime.now())
                .build());
        when(imService.getSessionsById()).thenReturn(sessionsById);
        when(imService.isSessionActive("1", "zombie-session")).thenReturn(false);
        when(imService.isSessionActive("2", "healthy-session")).thenReturn(true);

        task.cleanupInactiveSessions();

        verify(imService).unregisterSession(eq("1"), eq("zombie-session"),
                argThat(status -> status.getCode() == CloseStatus.GOING_AWAY.getCode()
                        && "session stale".equals(status.getReason())));
        verify(imService, never()).unregisterSession(eq("2"), eq("healthy-session"), any());
    }
}
