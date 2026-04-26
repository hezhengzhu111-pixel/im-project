package com.im.feign;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.openfeign.FeignClient;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ImServerFeignClientTest {

    @Test
    void feignClient_shouldAllowDirectImServerUrlOverride() {
        FeignClient annotation = ImServerFeignClient.class.getAnnotation(FeignClient.class);

        assertEquals("${im.server.url:}", annotation.url());
        assertEquals("im-server", annotation.name());
        assertEquals("/api/im", annotation.path());
    }
}
