package com.im.log;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

class DesensitizationConverterTest {

    @Test
    void testConvertPhone() {
        DesensitizationConverter converter = new DesensitizationConverter();
        ILoggingEvent event = Mockito.mock(ILoggingEvent.class);
        when(event.getFormattedMessage()).thenReturn("User phone is 13812345678");

        String result = converter.convert(event);
        assertEquals("User phone is 138****5678", result);
    }

    @Test
    void testConvertIdCard() {
        DesensitizationConverter converter = new DesensitizationConverter();
        ILoggingEvent event = Mockito.mock(ILoggingEvent.class);
        when(event.getFormattedMessage()).thenReturn("ID is 110105199001011234");

        String result = converter.convert(event);
        assertEquals("ID is 110105********1234", result);
    }
}
