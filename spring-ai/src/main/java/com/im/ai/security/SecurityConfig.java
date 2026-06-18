package com.im.ai.security;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SecurityConfig {

    @Bean
    public FilterRegistrationBean<InternalSignatureFilter> internalSignatureFilterRegistration(
            InternalSignatureFilter filter) {
        FilterRegistrationBean<InternalSignatureFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(filter);
        registration.addUrlPatterns("/api/ai/internal/*");
        registration.setOrder(1);
        return registration;
    }
}
