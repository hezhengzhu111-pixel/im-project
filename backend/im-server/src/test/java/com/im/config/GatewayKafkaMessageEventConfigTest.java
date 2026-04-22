package com.im.config;

import com.im.dto.MessageEvent;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GatewayKafkaMessageEventConfigTest {

    private ImNodeIdentity nodeIdentity;
    private GatewayKafkaMessageEventConfig config;

    @BeforeEach
    void setUp() {
        nodeIdentity = mock(ImNodeIdentity.class);
        when(nodeIdentity.getInstanceId()).thenReturn("node-1");
        config = new GatewayKafkaMessageEventConfig(nodeIdentity);
        ReflectionTestUtils.setField(config, "pushRoutingMode", "instance");
        ReflectionTestUtils.setField(config, "configuredPushConsumerGroupId", "");
    }

    @Test
    void validatePushRoutingMode_shouldFailFastForSharedGroupIdInLocalFilterMode() {
        assertThrows(IllegalStateException.class,
                () -> config.validatePushRoutingMode("local-session", "shared-group"));
    }

    @Test
    void listenerFactories_shouldUseStableGroupsForSingleNodeInstanceRouting() {
        ConcurrentKafkaListenerContainerFactory<String, MessageEvent> ingressFactory =
                config.gatewayMessageEventKafkaListenerContainerFactory(
                        "localhost:9092", "", "earliest", 100, 1, 1000L);
        ConcurrentKafkaListenerContainerFactory<String, MessageEvent> dispatchFactory =
                config.gatewayRoutedMessageEventKafkaListenerContainerFactory(
                        "localhost:9092", "", "earliest", 100, 1, 1000L);

        assertEquals("im-ws-pusher-router", groupIdOf(ingressFactory));
        assertEquals("im-ws-pusher-dispatch.node-1", groupIdOf(dispatchFactory));
    }

    private String groupIdOf(ConcurrentKafkaListenerContainerFactory<String, MessageEvent> factory) {
        @SuppressWarnings("unchecked")
        DefaultKafkaConsumerFactory<String, MessageEvent> consumerFactory =
                (DefaultKafkaConsumerFactory<String, MessageEvent>) factory.getConsumerFactory();
        return String.valueOf(consumerFactory.getConfigurationProperties().get(ConsumerConfig.GROUP_ID_CONFIG));
    }
}
