package com.im.log.controller;

import com.im.dto.ApiResponse;
import com.im.log.entity.LogDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.query.Query;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LogControllerPermissionTest {

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void queryLogsRejectsUserWithoutLogReadPermission() {
        LogQueryController controller = new LogQueryController(mock(ElasticsearchOperations.class), "missing");
        setPermissions(List.of());

        assertThrows(SecurityException.class, () -> controller.queryLogs(null, null, null, 0, 10));
    }

    @Test
    void queryLogsAllowsLogReadPermission() {
        ElasticsearchOperations operations = mock(ElasticsearchOperations.class);
        when(operations.search(any(Query.class), eq(LogDocument.class))).thenThrow(new RuntimeException("es down"));
        LogQueryController controller = new LogQueryController(operations, "missing");
        setPermissions(List.of("log:read"));

        ApiResponse<List<LogDocument>> response = controller.queryLogs(null, null, null, 0, 10);

        assertEquals(200, response.getCode());
        assertNotNull(response.getData());
    }

    @Test
    void streamRejectsUserWithoutLogReadPermission() {
        SseLogController controller = new SseLogController();
        setPermissions(List.of());

        assertThrows(SecurityException.class, controller::stream);
    }

    @Test
    void streamAllowsAdminPermission() {
        SseLogController controller = new SseLogController();
        setPermissions(List.of("admin"));

        SseEmitter emitter = controller.stream();

        assertNotNull(emitter);
    }

    private void setPermissions(List<String> permissions) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("authPermissions", permissions);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }
}
