package com.im.ai.security;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * HMAC signature verification filter for internal API endpoints.
 * Validates requests to /api/ai/internal/** using the same canonical
 * format as the Rust api-server-rs and im-server-rs services.
 */
@Component
public class InternalSignatureFilter extends OncePerRequestFilter {

    private static final String TS_HEADER = "X-Internal-Timestamp";
    private static final String NONCE_HEADER = "X-Internal-Nonce";
    private static final String SIGN_HEADER = "X-Internal-Signature";
    private static final String INTERNAL_PATH_PREFIX = "/api/ai/internal/";

    @Value("${IM_INTERNAL_SECRET:}")
    private String internalSecret;

    @Value("${IM_INTERNAL_MAX_SKEW_MS:300000}")
    private long maxSkewMs;

    @Autowired
    private NonceCache nonceCache;

    @PostConstruct
    void validateConfig() {
        if (internalSecret == null || internalSecret.isBlank()) {
            throw new IllegalStateException(
                    "IM_INTERNAL_SECRET environment variable is required");
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain)
            throws ServletException, IOException {

        String uri = request.getRequestURI();
        if (!uri.startsWith(INTERNAL_PATH_PREFIX)) {
            chain.doFilter(request, response);
            return;
        }

        // Cache request body so controller can still read it
        CachedBodyRequestWrapper wrapped = new CachedBodyRequestWrapper(request);

        String ts = request.getHeader(TS_HEADER);
        String nonce = request.getHeader(NONCE_HEADER);
        String signature = request.getHeader(SIGN_HEADER);

        if (ts == null || nonce == null || signature == null) {
            reject(response);
            return;
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(ts);
        } catch (NumberFormatException e) {
            reject(response);
            return;
        }

        if (!withinSkew(timestamp, maxSkewMs)) {
            reject(response);
            return;
        }

        if (!nonceCache.tryClaim(nonce, maxSkewMs)) {
            reject(response);
            return;
        }

        byte[] body = wrapped.getCachedBody();
        String bodyHash = sha256Base64Url(body);
        String method = request.getMethod().toUpperCase().trim();
        String path = normalizePath(uri);

        String canonical = "method=" + method
                + "&path=" + path
                + "&bodyHash=" + bodyHash
                + "&ts=" + ts
                + "&nonce=" + nonce;

        if (!verifyHmac(internalSecret, canonical, signature)) {
            reject(response);
            return;
        }

        chain.doFilter(wrapped, response);
    }

    private static void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"INTERNAL_AUTH_REJECTED\"}");
    }

    static String normalizePath(String path) {
        String withoutQuery = path.contains("?")
                ? path.substring(0, path.indexOf('?'))
                : path;
        return withoutQuery.startsWith("/") ? withoutQuery : "/" + withoutQuery;
    }

    static boolean withinSkew(long timestampMs, long allowedSkewMs) {
        long now = System.currentTimeMillis();
        long delta = Math.abs(now - timestampMs);
        return delta <= allowedSkewMs;
    }

    static String sha256Base64Url(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 failed", e);
        }
    }

    static boolean verifyHmac(String secret, String canonical, String signature) {
        try {
            String expected = hmacSha256(secret, canonical);
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }

    static String hmacSha256(String secret, String message) {
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

    /**
     * Request wrapper that caches the body bytes so the filter and controller
     * can both read it.
     */
    static class CachedBodyRequestWrapper extends HttpServletRequestWrapper {

        private final byte[] cachedBody;

        CachedBodyRequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            this.cachedBody = request.getInputStream().readAllBytes();
        }

        byte[] getCachedBody() {
            return cachedBody;
        }

        @Override
        public ServletInputStream getInputStream() {
            return new CachedBodyInputStream(cachedBody);
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(
                    new InputStreamReader(new ByteArrayInputStream(cachedBody),
                            StandardCharsets.UTF_8));
        }
    }

    static class CachedBodyInputStream extends ServletInputStream {

        private final ByteArrayInputStream delegate;

        CachedBodyInputStream(byte[] data) {
            this.delegate = new ByteArrayInputStream(data);
        }

        @Override
        public boolean isFinished() {
            return delegate.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int read() {
            return delegate.read();
        }
    }
}
