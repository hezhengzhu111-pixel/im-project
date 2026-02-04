package com.im.feign;

import feign.RequestTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

public class FeignInternalAuthConfigTest {

    @Test
    void apply_shouldSetInternalHeader() {
        FeignInternalAuthConfig interceptor = new FeignInternalAuthConfig();
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "s3cr3t");

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertTrue(template.headers().containsKey("X-Internal-Secret"));
        assertTrue(template.headers().get("X-Internal-Secret").contains("s3cr3t"));
    }
}

