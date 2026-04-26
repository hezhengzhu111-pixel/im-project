package com.im.config;

import org.springframework.aot.AotDetector;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.aot.hint.TypeReference;
import org.springframework.beans.PropertyValue;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConstructorArgumentValues;
import org.springframework.beans.factory.config.TypedStringValue;
import org.springframework.beans.factory.support.AbstractBeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.PriorityOrdered;
import org.springframework.util.ClassUtils;

import java.lang.reflect.Constructor;

@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(CommonNativeHintsConfiguration.CommonNativeRuntimeHints.class)
public class CommonNativeHintsConfiguration {

    private static final String MAPPER_FACTORY_BEAN_CLASS = "org.mybatis.spring.mapper.MapperFactoryBean";
    private static final String MAPPER_SCANNER_CONFIGURER_CLASS = "org.mybatis.spring.mapper.MapperScannerConfigurer";

    @Bean
    @Profile("native")
    static MybatisMapperNativePostProcessor mybatisMapperNativePostProcessor() {
        return new MybatisMapperNativePostProcessor();
    }

    static final class MybatisMapperNativePostProcessor implements BeanDefinitionRegistryPostProcessor, PriorityOrdered {

        @Override
        public int getOrder() {
            return Ordered.HIGHEST_PRECEDENCE;
        }

        @Override
        public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
            if (!AotDetector.useGeneratedArtifacts() || Boolean.getBoolean("spring.aot.processing")) {
                return;
            }
            for (String beanName : registry.getBeanDefinitionNames()) {
                BeanDefinition beanDefinition = registry.getBeanDefinition(beanName);
                if (hasBeanClass(beanDefinition, MAPPER_SCANNER_CONFIGURER_CLASS)) {
                    registry.removeBeanDefinition(beanName);
                    registry.registerBeanDefinition(
                            beanName,
                            new RootBeanDefinition(NoOpMapperScannerConfigurer.class)
                    );
                }
            }
        }

        @Override
        public void postProcessBeanFactory(org.springframework.beans.factory.config.ConfigurableListableBeanFactory beanFactory) {
            ClassLoader classLoader = ClassUtils.getDefaultClassLoader();
            for (String beanName : beanFactory.getBeanDefinitionNames()) {
                BeanDefinition beanDefinition = beanFactory.getBeanDefinition(beanName);
                if (!hasBeanClass(beanDefinition, MAPPER_FACTORY_BEAN_CLASS)) {
                    continue;
                }
                Class<?> mapperInterface = resolveMapperInterface(beanDefinition, classLoader);
                if (mapperInterface == null) {
                    continue;
                }
                beanDefinition.getPropertyValues().add("mapperInterface", mapperInterface);
                ConstructorArgumentValues constructorArguments = beanDefinition.getConstructorArgumentValues();
                constructorArguments.clear();
                constructorArguments.addIndexedArgumentValue(0, mapperInterface);
                if (beanDefinition instanceof AbstractBeanDefinition abstractBeanDefinition) {
                    abstractBeanDefinition.setAutowireMode(AbstractBeanDefinition.AUTOWIRE_BY_TYPE);
                    if (!Boolean.getBoolean("spring.aot.processing")) {
                        abstractBeanDefinition.setInstanceSupplier(
                                () -> instantiateMapperFactoryBean(mapperInterface)
                        );
                    }
                }
            }
        }
    }

    static final class NoOpMapperScannerConfigurer implements BeanDefinitionRegistryPostProcessor, PriorityOrdered {

        @Override
        public int getOrder() {
            return Ordered.HIGHEST_PRECEDENCE;
        }

        @Override
        public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        }

        @Override
        public void postProcessBeanFactory(org.springframework.beans.factory.config.ConfigurableListableBeanFactory beanFactory) {
        }
    }

    private static boolean hasBeanClass(BeanDefinition beanDefinition, String className) {
        if (className.equals(beanDefinition.getBeanClassName())) {
            return true;
        }
        return beanDefinition instanceof AbstractBeanDefinition abstractBeanDefinition
                && abstractBeanDefinition.hasBeanClass()
                && className.equals(abstractBeanDefinition.getBeanClass().getName());
    }

    private static Class<?> resolveMapperInterface(BeanDefinition beanDefinition, ClassLoader classLoader) {
        PropertyValue propertyValue = beanDefinition.getPropertyValues().getPropertyValue("mapperInterface");
        Class<?> mapperInterface = resolveClassValue(
                propertyValue == null ? null : propertyValue.getValue(),
                classLoader
        );
        if (mapperInterface != null) {
            return mapperInterface;
        }

        ConstructorArgumentValues constructorArguments = beanDefinition.getConstructorArgumentValues();
        ConstructorArgumentValues.ValueHolder indexedValue = constructorArguments.getIndexedArgumentValues().get(0);
        mapperInterface = resolveClassValue(indexedValue == null ? null : indexedValue.getValue(), classLoader);
        if (mapperInterface != null) {
            return mapperInterface;
        }

        for (ConstructorArgumentValues.ValueHolder valueHolder : constructorArguments.getGenericArgumentValues()) {
            mapperInterface = resolveClassValue(valueHolder.getValue(), classLoader);
            if (mapperInterface != null) {
                return mapperInterface;
            }
        }
        return null;
    }

    private static Class<?> resolveClassValue(Object value, ClassLoader classLoader) {
        if (value instanceof Class<?> clazz) {
            return clazz;
        }
        if (value instanceof TypedStringValue typedStringValue) {
            return resolveClassName(typedStringValue.getValue(), classLoader);
        }
        if (value instanceof String className) {
            return resolveClassName(className, classLoader);
        }
        return null;
    }

    private static Class<?> resolveClassName(String className, ClassLoader classLoader) {
        if (className == null || className.isBlank()) {
            return null;
        }
        try {
            return ClassUtils.forName(className, classLoader);
        } catch (ClassNotFoundException ex) {
            throw new IllegalStateException("Failed to resolve MyBatis mapper interface: " + className, ex);
        }
    }

    private static Object instantiateMapperFactoryBean(Class<?> mapperInterface) {
        try {
            Class<?> factoryBeanClass = ClassUtils.forName(MAPPER_FACTORY_BEAN_CLASS, mapperInterface.getClassLoader());
            Constructor<?> constructor = factoryBeanClass.getConstructor(Class.class);
            return constructor.newInstance(mapperInterface);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException(
                    "Failed to instantiate MyBatis MapperFactoryBean for " + mapperInterface.getName(),
                    ex
            );
        }
    }

    static final class CommonNativeRuntimeHints implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            hints.resources().registerPattern("application*.yml");
            hints.resources().registerPattern("bootstrap*.yml");
            hints.resources().registerPattern("logback-spring.xml");
            hints.resources().registerPattern("dev/*.yml");
            hints.resources().registerPattern("sit/*.yml");
            hints.resources().registerPattern("ratelimit/*.lua");
            hints.resources().registerPattern("static/*");
            registerPublicConstructors(hints, "org.apache.ibatis.logging.slf4j.Slf4jImpl");
            registerPublicConstructors(hints, MAPPER_FACTORY_BEAN_CLASS);
        }

        private static void registerPublicConstructors(RuntimeHints hints, String typeName) {
            hints.reflection().registerType(
                    TypeReference.of(typeName),
                    builder -> builder.withMembers(MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS)
            );
        }
    }
}
