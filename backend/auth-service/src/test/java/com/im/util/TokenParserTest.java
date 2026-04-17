package com.im.util;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenParserTest {

    @Test
    void parseAccessToken_shouldMaskTokenInWarnLogs() {
        TokenParser parser = new TokenParser();
        ReflectionTestUtils.setField(parser, "accessSecret", "im-access-secret-im-access-secret-im-access-secret-im-access-secret");
        ListAppender<ILoggingEvent> appender = attachListAppender();
        String rawToken = "Bearer raw-access-token-value-123";

        try {
            TokenParser.TokenParseInfo result = parser.parseAccessToken(rawToken);

            assertFalse(result.isValid());
            String joinedLogs = joinedMessages(appender);
            assertFalse(joinedLogs.contains("raw-access-token-value-123"));
            assertTrue(joinedLogs.contains("tokenSummary=sha256:"));
            assertTrue(joinedLogs.contains("errorType="));
        } finally {
            detachListAppender(appender);
        }
    }

    private ListAppender<ILoggingEvent> attachListAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(TokenParser.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachListAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(TokenParser.class);
        logger.detachAppender(appender);
    }

    private String joinedMessages(ListAppender<ILoggingEvent> appender) {
        StringBuilder builder = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            builder.append(event.getFormattedMessage()).append('\n');
        }
        return builder.toString();
    }
}
