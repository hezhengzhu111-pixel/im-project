package com.im.feign;

import com.im.config.RateLimitGlobalProperties;
import com.im.util.AuthHeaderUtil;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import feign.Target;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.URI;
import java.time.Clock;
import java.util.function.Supplier;

@Configuration
public class FeignInternalAuthConfig implements RequestInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String RATE_LIMIT_SWITCH_HEADER = RateLimitGlobalProperties.SWITCH_HEADER;

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.internal.legacy-secret-only.enabled:false}")
    private boolean internalLegacySecretOnlyEnabled;

    @Value("${im.gateway.user-id-header:X-User-Id}")
    private String gatewayUserIdHeader;

    @Value("${im.gateway.username-header:X-Username}")
    private String gatewayUsernameHeader;

    private Clock clock = Clock.systemUTC();
    private Supplier<String> nonceSupplier = () -> java.util.UUID.randomUUID().toString();

    @Override
    public void apply(RequestTemplate template) {
        applyInternalSignature(template);
        propagateAuthorization(template);
        propagateGatewayIdentity(template);
        propagateRateLimitSwitch(template);
        template.header("Content-Type", "application/json");
        template.header("Accept", "application/json");
    }

    private void applyInternalSignature(RequestTemplate template) {
        if (!StringUtils.hasText(internalSecret)) {
            throw new IllegalStateException("im.internal.secret must be configured");
        }

        String timestamp = String.valueOf(clock.millis());
        String nonce = nonceSupplier.get();
        String bodyHash = AuthHeaderUtil.sha256Base64Url(template.body());
        String signature = AuthHeaderUtil.signHmacSha256(
                internalSecret,
                AuthHeaderUtil.buildInternalSignedFields(
                        template.method(),
                        resolvePath(template),
                        bodyHash,
                        timestamp,
                        nonce
                )
        );

        template.header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp);
        template.header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce);
        template.header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER, signature);
        if (internalLegacySecretOnlyEnabled && StringUtils.hasText(internalHeaderName)) {
            template.header(internalHeaderName, internalSecret);
        }
    }

    private void propagateAuthorization(RequestTemplate template) {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return;
        }
        String authorization = request.getHeader(AUTHORIZATION_HEADER);
        if (StringUtils.hasText(authorization)) {
            template.header(AUTHORIZATION_HEADER, authorization.trim());
        }
    }

    private void propagateGatewayIdentity(RequestTemplate template) {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return;
        }

        String userId = readHeaderOrAttribute(request, gatewayUserIdHeader, "userId");
        String username = readHeaderOrAttribute(request, gatewayUsernameHeader, "username");
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(username)) {
            return;
        }

        template.header(gatewayUserIdHeader, userId.trim());
        template.header(gatewayUsernameHeader, username.trim());
    }

    private void propagateRateLimitSwitch(RequestTemplate template) {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return;
        }
        String switchValue = request.getHeader(RATE_LIMIT_SWITCH_HEADER);
        if (StringUtils.hasText(switchValue)) {
            template.header(RATE_LIMIT_SWITCH_HEADER, switchValue.trim());
        }
    }

    private String resolvePath(RequestTemplate template) {
        String path = extractPathComponent(template.path());
        if (!StringUtils.hasText(path)) {
            path = extractPathComponent(template.url());
        }

        String normalizedPath = AuthHeaderUtil.normalizeInternalPath(path);
        Target<?> feignTarget = template.feignTarget();
        if (feignTarget == null || !StringUtils.hasText(feignTarget.url())) {
            return normalizedPath;
        }

        String targetPath = extractPathComponent(feignTarget.url());
        if (!StringUtils.hasText(targetPath) || "/".equals(targetPath)) {
            return normalizedPath;
        }

        String normalizedTargetPath = AuthHeaderUtil.normalizeInternalPath(targetPath);
        if (normalizedPath.equals(normalizedTargetPath)
                || normalizedPath.startsWith(normalizedTargetPath + "/")) {
            return normalizedPath;
        }

        if ("/".equals(normalizedPath)) {
            return normalizedTargetPath;
        }

        return AuthHeaderUtil.normalizeInternalPath(normalizedTargetPath + normalizedPath);
    }

    private String extractPathComponent(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }

        String trimmed = value.trim();
        try {
            URI uri = URI.create(trimmed);
            if (uri.isAbsolute()) {
                return uri.getRawPath();
            }
        } catch (IllegalArgumentException ignored) {
        }
        return trimmed;
    }

    private String readHeaderOrAttribute(HttpServletRequest request, String headerName, String attributeName) {
        String fromHeader = request.getHeader(headerName);
        if (StringUtils.hasText(fromHeader)) {
            return fromHeader;
        }

        Object attributeValue = request.getAttribute(attributeName);
        if (attributeValue == null) {
            return null;
        }

        String fromAttribute = String.valueOf(attributeValue);
        return StringUtils.hasText(fromAttribute) ? fromAttribute : null;
    }

    private HttpServletRequest currentRequest() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servletRequestAttributes)) {
            return null;
        }
        return servletRequestAttributes.getRequest();
    }
}
