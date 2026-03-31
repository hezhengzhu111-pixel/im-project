package com.im.feign;

import feign.RequestInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Configuration
public class FeignInternalAuthConfig implements RequestInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.gateway.user-id-header:X-User-Id}")
    private String gatewayUserIdHeader;

    @Value("${im.gateway.username-header:X-Username}")
    private String gatewayUsernameHeader;

    @Override
    public void apply(feign.RequestTemplate template) {
        if (internalHeaderName != null && internalSecret != null) {
            template.header(internalHeaderName, internalSecret);
        }
        propagateAuthorization(template);
        propagateGatewayIdentity(template);
        template.header("Content-Type", "application/json");
        template.header("Accept", "application/json");
    }

    private void propagateAuthorization(feign.RequestTemplate template) {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return;
        }
        String authorization = request.getHeader(AUTHORIZATION_HEADER);
        if (StringUtils.hasText(authorization)) {
            template.header(AUTHORIZATION_HEADER, authorization.trim());
        }
    }

    private void propagateGatewayIdentity(feign.RequestTemplate template) {
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
