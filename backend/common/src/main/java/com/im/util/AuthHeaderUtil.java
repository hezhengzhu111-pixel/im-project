package com.im.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AuthHeaderUtil {

    private AuthHeaderUtil() {
    }

    public static String base64UrlEncode(String value) {
        if (value == null) {
            return null;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    public static String base64UrlDecodeToString(String value) {
        if (value == null) {
            return null;
        }
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    public static String signHmacSha256(String secret, Map<String, String> fields) {
        try {
            String canonical = canonicalize(fields);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (Exception e) {
            throw new RuntimeException("签名失败", e);
        }
    }

    public static boolean verifyHmacSha256(String secret, Map<String, String> fields, String signature) {
        if (signature == null || signature.isEmpty()) {
            return false;
        }
        String expected = signHmacSha256(secret, fields);
        return constantTimeEquals(expected, signature);
    }

    public static Map<String, String> buildSignedFields(String userId, String username, String user, String perms, String data, String ts, String nonce) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("userId", userId);
        fields.put("username", username);
        fields.put("user", user);
        fields.put("perms", perms);
        fields.put("data", data);
        fields.put("ts", ts);
        fields.put("nonce", nonce);
        return fields;
    }

    private static String canonicalize(Map<String, String> fields) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            if (!first) {
                sb.append('&');
            }
            first = false;
            sb.append(entry.getKey()).append('=').append(entry.getValue() == null ? "" : entry.getValue());
        }
        return sb.toString();
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}

