package com.im.exception;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.im.dto.ApiResponse;
import com.im.enums.CommonErrorCode;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

class AuthExceptionHandlerTest {

    @Test
    void handleAuthServiceExceptionShouldLogThrowable() {
        AuthExceptionHandler handler = new AuthExceptionHandler();
        ListAppender<ILoggingEvent> appender = attachAppender();

        try {
            AuthServiceException exception = new AuthServiceException(CommonErrorCode.TOKEN_INVALID);

            ResponseEntity<ApiResponse<Void>> response = handler.handleAuthServiceException(exception);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertFalse(appender.list.isEmpty());
            ILoggingEvent event = appender.list.getLast();
            assertEquals("认证异常: TOKEN_INVALID", event.getFormattedMessage());
            assertNotNull(event.getThrowableProxy());
            assertEquals(AuthServiceException.class.getName(), event.getThrowableProxy().getClassName());
        } finally {
            detachAppender(appender);
        }
    }

    @Test
    void handleSecurityExceptionShouldLogThrowable() {
        AuthExceptionHandler handler = new AuthExceptionHandler();
        ListAppender<ILoggingEvent> appender = attachAppender();

        try {
            SecurityException exception = new SecurityException("access token expired");

            ResponseEntity<ApiResponse<Void>> response = handler.handleSecurityException(exception);

            assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
            assertFalse(appender.list.isEmpty());
            ILoggingEvent event = appender.list.getLast();
            assertEquals("认证安全异常: TOKEN_EXPIRED", event.getFormattedMessage());
            assertNotNull(event.getThrowableProxy());
            assertEquals(SecurityException.class.getName(), event.getThrowableProxy().getClassName());
        } finally {
            detachAppender(appender);
        }
    }

    private ListAppender<ILoggingEvent> attachAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(AuthExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(AuthExceptionHandler.class);
        logger.detachAppender(appender);
    }
}
