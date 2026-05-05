package com.im.ai.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import static org.junit.jupiter.api.Assertions.*;

class InternalSignatureFilterTest {

    private static final String SECRET = "test-internal-secret-key-32bytes!";

    private InternalSignatureFilter filter;
    private NonceCache nonceCache;
    private boolean chainCalled;

    @BeforeEach
    void setUp() throws Exception {
        nonceCache = new NonceCache();
        filter = new InternalSignatureFilter();

        // Inject fields via reflection
        var secretField = InternalSignatureFilter.class.getDeclaredField("internalSecret");
        secretField.setAccessible(true);
        secretField.set(filter, SECRET);

        var skewField = InternalSignatureFilter.class.getDeclaredField("maxSkewMs");
        skewField.setAccessible(true);
        skewField.set(filter, 300_000L);

        var nonceField = InternalSignatureFilter.class.getDeclaredField("nonceCache");
        nonceField.setAccessible(true);
        nonceField.set(filter, nonceCache);

        // Call @PostConstruct manually
        var validateMethod = InternalSignatureFilter.class.getDeclaredMethod("validateConfig");
        validateMethod.setAccessible(true);
        validateMethod.invoke(filter);

        chainCalled = false;
    }

    @Test
    void noSignatureReturns403() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/ai/internal/test-key");
        request.setMethod("POST");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, (req, resp) -> chainCalled = true);

        assertEquals(403, response.getStatus());
        assertFalse(chainCalled);
        assertTrue(response.getContentAsString().contains("INTERNAL_AUTH_REJECTED"));
    }

    @Test
    void badSignatureReturns403() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/ai/internal/test-key");
        request.setMethod("POST");
        request.setContent("{}".getBytes(StandardCharsets.UTF_8));

        long ts = System.currentTimeMillis();
        String nonce = UUID.randomUUID().toString();
        request.addHeader("X-Internal-Timestamp", String.valueOf(ts));
        request.addHeader("X-Internal-Nonce", nonce);
        request.addHeader("X-Internal-Signature", "bad-signature-value");

        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, (req, resp) -> chainCalled = true);

        assertEquals(403, response.getStatus());
        assertFalse(chainCalled);
    }

    @Test
    void validSignaturePassesThrough() throws ServletException, IOException {
        String body = "{\"key\":\"value\"}";
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        String method = "POST";
        String path = "/api/ai/internal/test-key";
        long ts = System.currentTimeMillis();
        String nonce = UUID.randomUUID().toString();

        String bodyHash = sha256Base64Url(bodyBytes);
        String canonical = "method=" + method
                + "&path=" + path
                + "&bodyHash=" + bodyHash
                + "&ts=" + ts
                + "&nonce=" + nonce;
        String signature = hmacSha256(SECRET, canonical);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI(path);
        request.setMethod(method);
        request.setContent(bodyBytes);
        request.addHeader("X-Internal-Timestamp", String.valueOf(ts));
        request.addHeader("X-Internal-Nonce", nonce);
        request.addHeader("X-Internal-Signature", signature);

        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, (req, resp) -> chainCalled = true);

        assertEquals(200, response.getStatus());
        assertTrue(chainCalled);
    }

    @Test
    void replayNonceReturns403() throws ServletException, IOException {
        String body = "{\"data\":\"test\"}";
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        String method = "POST";
        String path = "/api/ai/internal/test-key";
        long ts = System.currentTimeMillis();
        String nonce = UUID.randomUUID().toString();

        String bodyHash = sha256Base64Url(bodyBytes);
        String canonical = "method=" + method
                + "&path=" + path
                + "&bodyHash=" + bodyHash
                + "&ts=" + ts
                + "&nonce=" + nonce;
        String signature = hmacSha256(SECRET, canonical);

        // First request — should pass
        MockHttpServletRequest request1 = new MockHttpServletRequest();
        request1.setRequestURI(path);
        request1.setMethod(method);
        request1.setContent(bodyBytes);
        request1.addHeader("X-Internal-Timestamp", String.valueOf(ts));
        request1.addHeader("X-Internal-Nonce", nonce);
        request1.addHeader("X-Internal-Signature", signature);

        MockHttpServletResponse response1 = new MockHttpServletResponse();
        boolean firstChainCalled = false;

        filter.doFilterInternal(request1, response1, (req, resp) -> {});

        assertEquals(200, response1.getStatus());

        // Second request with same nonce — should be rejected
        MockHttpServletRequest request2 = new MockHttpServletRequest();
        request2.setRequestURI(path);
        request2.setMethod(method);
        request2.setContent(bodyBytes);
        request2.addHeader("X-Internal-Timestamp", String.valueOf(ts));
        request2.addHeader("X-Internal-Nonce", nonce);
        request2.addHeader("X-Internal-Signature", signature);

        MockHttpServletResponse response2 = new MockHttpServletResponse();
        chainCalled = false;

        filter.doFilterInternal(request2, response2, (req, resp) -> chainCalled = true);

        assertEquals(403, response2.getStatus());
        assertFalse(chainCalled);
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
