package com.im.log;

import ch.qos.logback.classic.pattern.MessageConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DesensitizationConverter extends MessageConverter {

    // Phone number pattern: e.g. 13812345678 -> 138****5678
    private static final Pattern PHONE_PATTERN = Pattern.compile("(?<!\\d)(1[3-9]\\d)\\d{4}(\\d{4})(?!\\d)");
    // ID card pattern: 18 digits -> 123456********1234
    private static final Pattern IDCARD_PATTERN = Pattern.compile("(?<!\\d)(\\d{6})\\d{8}(\\d{3}[0-9Xx])(?!\\d)");

    @Override
    public String convert(ILoggingEvent event) {
        String msg = super.convert(event);
        if (msg == null) {
            return null;
        }
        msg = desensitize(msg, PHONE_PATTERN, "$1****$2");
        msg = desensitize(msg, IDCARD_PATTERN, "$1********$2");
        return msg;
    }

    private String desensitize(String msg, Pattern pattern, String replacement) {
        Matcher matcher = pattern.matcher(msg);
        return matcher.replaceAll(replacement);
    }
}
