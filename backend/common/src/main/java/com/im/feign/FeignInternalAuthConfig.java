package com.im.feign;

import feign.RequestInterceptor;
import org.springframework.beans.factory.annotation.Value;

public class FeignInternalAuthConfig implements RequestInterceptor {

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @Override
    public void apply(feign.RequestTemplate template) {
        if (internalHeaderName != null && internalSecret != null) {
            template.header(internalHeaderName, internalSecret);
        }
        // 设置 Content-Type 为 application/json
        template.header("Content-Type", "application/json");
        template.header("Accept", "application/json");
    }
}

