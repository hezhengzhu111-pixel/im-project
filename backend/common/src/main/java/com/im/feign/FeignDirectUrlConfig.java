package com.im.feign;

import feign.Request;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FeignDirectUrlConfig {

    @Bean
    public feign.RequestInterceptor directUrlInterceptor() {
        return template -> {
            // 直接使用服务名调用
        };
    }
}
