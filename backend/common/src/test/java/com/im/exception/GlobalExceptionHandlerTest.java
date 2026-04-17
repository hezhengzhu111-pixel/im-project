package com.im.exception;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    @Test
    void handleBusinessExceptionShouldLogThrowableAndKeepBadRequestResponse() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        ListAppender<ILoggingEvent> appender = attachAppender();

        try {
            BusinessException exception = new BusinessException("登录失败");

            ResponseEntity<com.im.dto.ApiResponse<Void>> response = handler.handleBusinessException(exception);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertNotNull(response.getBody());
            assertEquals(400, response.getBody().getCode());
            assertEquals("登录失败", response.getBody().getMessage());
            assertFalse(appender.list.isEmpty());
            ILoggingEvent event = appender.list.getLast();
            assertEquals("业务异常: 登录失败", event.getFormattedMessage());
            assertNotNull(event.getThrowableProxy());
            assertEquals(BusinessException.class.getName(), event.getThrowableProxy().getClassName());
        } finally {
            detachAppender(appender);
        }
    }

    @Test
    void handleRuntimeExceptionShouldLogThrowableAndKeepInternalServerErrorResponse() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        ListAppender<ILoggingEvent> appender = attachAppender();

        try {
            RuntimeException exception = new RuntimeException("auth service unavailable");

            ResponseEntity<com.im.dto.ApiResponse<Void>> response = handler.handleRuntimeException(exception);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertNotNull(response.getBody());
            assertEquals(500, response.getBody().getCode());
            assertEquals("系统内部错误: auth service unavailable", response.getBody().getMessage());
            assertFalse(appender.list.isEmpty());
            ILoggingEvent event = appender.list.getLast();
            assertEquals("运行时异常", event.getFormattedMessage());
            assertNotNull(event.getThrowableProxy());
            assertEquals(RuntimeException.class.getName(), event.getThrowableProxy().getClassName());
        } finally {
            detachAppender(appender);
        }
    }

    private ListAppender<ILoggingEvent> attachAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        logger.detachAppender(appender);
    }
}
