package com.im.config;

import cn.hutool.core.lang.Snowflake;
import com.im.interceptor.TraceIdInterceptor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class TraceIdWebMvcConfig implements WebMvcConfigurer {

    private final Snowflake snowflake;

    public TraceIdWebMvcConfig(Snowflake snowflake) {
        this.snowflake = snowflake;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new TraceIdInterceptor(snowflake)).addPathPatterns("/**");
    }
}
