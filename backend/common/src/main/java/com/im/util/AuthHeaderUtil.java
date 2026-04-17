package com.im.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public final class AuthHeaderUtil {
    public static final String INTERNAL_TIMESTAMP_HEADER = "X-Internal-Timestamp";
    public static final String INTERNAL_NONCE_HEADER = "X-Internal-Nonce";
    public static final String INTERNAL_SIGNATURE_HEADER = "X-Internal-Signature";

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

    public static Map<String, String> buildInternalSignedFields(String method, String path, String bodyHash, String ts, String nonce) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("method", normalizeMethod(method));
        fields.put("path", normalizeInternalPath(path));
        fields.put("bodyHash", bodyHash == null ? sha256Base64Url(new byte[0]) : bodyHash);
        fields.put("ts", ts);
        fields.put("nonce", nonce);
        return fields;
    }

    public static String sha256Base64Url(byte[] value) {
        try {
            byte[] normalized = value == null ? new byte[0] : value;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(normalized);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new RuntimeException("hash failed", e);
        }
    }

    public static String normalizeInternalPath(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }
        String normalized = path.trim();
        int queryIndex = normalized.indexOf('?');
        if (queryIndex >= 0) {
            normalized = normalized.substring(0, queryIndex);
        }
        return normalized.startsWith("/") ? normalized : "/" + normalized;
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

    private static String normalizeMethod(String method) {
        if (method == null || method.isBlank()) {
            return "";
        }
        return method.trim().toUpperCase(Locale.ROOT);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}

