package com.im.ai.callback;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class HmacSigner {

    public static Map<String, String> signRequest(String method, String path,
                                                   byte[] body, String secret) {
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = UUID.randomUUID().toString();
        String bodyHash = sha256Base64Url(body);

        String canonical = "method=" + method.toUpperCase()
                + "&path=" + path
                + "&bodyHash=" + bodyHash
                + "&ts=" + ts
                + "&nonce=" + nonce;

        String signature = hmacSha256(secret, canonical);

        Map<String, String> headers = new HashMap<>();
        headers.put("X-Internal-Timestamp", ts);
        headers.put("X-Internal-Nonce", nonce);
        headers.put("X-Internal-Signature", signature);
        headers.put("Content-Type", "application/json");
        return headers;
    }

    private static String sha256Base64Url(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 failed", e);
        }
    }

    private static String hmacSha256(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] result = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(result);
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256 failed", e);
        }
    }
}
