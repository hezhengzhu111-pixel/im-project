package com.im.util;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AuthHeaderUtilTest {

    @Test
    void buildInternalSignedFieldsShouldNormalizeMethodAndPath() {
        Map<String, String> fields = AuthHeaderUtil.buildInternalSignedFields(
                "post",
                "api/auth/internal/ws-ticket/consume?debug=true",
                "body-hash",
                "123456",
                "nonce-1"
        );

        assertEquals("POST", fields.get("method"));
        assertEquals("/api/auth/internal/ws-ticket/consume", fields.get("path"));
        assertEquals("body-hash", fields.get("bodyHash"));
        assertEquals("123456", fields.get("ts"));
        assertEquals("nonce-1", fields.get("nonce"));
    }

    @Test
    void sha256Base64UrlShouldMatchKnownValue() {
        String digest = AuthHeaderUtil.sha256Base64Url("{}".getBytes(StandardCharsets.UTF_8));

        assertEquals("RBNvo1WzZ4oRRq0W9-hknpT7T8If536DEMBg9hyq_4o", digest);
    }
}
