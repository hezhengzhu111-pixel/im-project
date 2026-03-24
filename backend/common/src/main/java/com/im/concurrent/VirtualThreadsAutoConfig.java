package com.im.concurrent;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.lang.reflect.Method;

@Configuration
public class VirtualThreadsAutoConfig {

    @Bean
    @ConditionalOnClass(TomcatServletWebServerFactory.class)
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatVirtualThreadsCustomizer(
            @Value("${im.virtual-threads.enabled:true}") boolean enabled) {
        return factory -> {
            if (!enabled || Runtime.version().feature() < 21) {
                return;
            }
            try {
                Method method = TomcatServletWebServerFactory.class.getMethod("setUseVirtualThreads", boolean.class);
                method.invoke(factory, true);
            } catch (Throwable ignored) {
            }
        };
    }
}

