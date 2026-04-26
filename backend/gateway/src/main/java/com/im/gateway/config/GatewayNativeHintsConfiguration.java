package com.im.gateway.config;

import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(GatewayNativeHintsConfiguration.GatewayNativeRuntimeHints.class)
public class GatewayNativeHintsConfiguration {

    static final class GatewayNativeRuntimeHints implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            hints.resources().registerPattern("ratelimit/*.lua");
        }
    }
}
