package com.im.registry.config;

import com.im.registry.model.RegistryAlert;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(RegistryMonitorNativeHintsConfiguration.RegistryMonitorNativeRuntimeHints.class)
public class RegistryMonitorNativeHintsConfiguration {

    static final class RegistryMonitorNativeRuntimeHints implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            hints.resources().registerPattern("application*.yml");
            hints.resources().registerPattern("bootstrap*.yml");
            hints.resources().registerPattern("logback-spring.xml");
            hints.resources().registerPattern("dev/*.yml");
            hints.resources().registerPattern("sit/*.yml");

            hints.reflection().registerType(
                    RegistryAlert.class,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.DECLARED_FIELDS
            );
            hints.reflection().registerType(
                    RegistryMonitorProperties.class,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.DECLARED_FIELDS
            );
            hints.reflection().registerType(
                    RegistryMonitorProperties.Nacos.class,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.DECLARED_FIELDS
            );
            hints.reflection().registerType(
                    RegistryMonitorProperties.Poll.class,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.DECLARED_FIELDS
            );
            hints.reflection().registerType(
                    RegistryMonitorProperties.Alert.class,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.DECLARED_FIELDS
            );
        }
    }
}
