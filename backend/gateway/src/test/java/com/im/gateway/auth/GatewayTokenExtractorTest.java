package com.im.gateway.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import static org.junit.jupiter.api.Assertions.*;

class GatewayTokenExtractorTest {

    private final GatewayTokenExtractor extractor = new GatewayTokenExtractor();

    @Test
    void extract_ShouldPreferAuthorizationHeaderAndReportRequestFlags() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer header-token")
                        .header("X-Gateway-Route", "gateway")
                        .cookie(new HttpCookie("IM_ACCESS_TOKEN", "cookie-token"))
                        .build()
        );

        GatewayAuthInput input = extractor.extract(
                exchange,
                "Authorization",
                "Bearer ",
                "IM_ACCESS_TOKEN",
                "IM_REFRESH_TOKEN",
                "X-Gateway-Route"
        );

        assertEquals("/api/message/list", input.path());
        assertEquals("header-token", input.token());
        assertTrue(input.authCookiePresent());
        assertTrue(input.gatewayRouteHeaderPresent());
        assertEquals("GET", input.method());
    }

    @Test
    void extract_ShouldFallbackToAccessCookieWhenHeaderMissing() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/message/list")
                        .cookie(new HttpCookie("IM_ACCESS_TOKEN", " cookie-token "))
                        .build()
        );

        GatewayAuthInput input = extractor.extract(
                exchange,
                "Authorization",
                "Bearer ",
                "IM_ACCESS_TOKEN",
                "IM_REFRESH_TOKEN",
                "X-Gateway-Route"
        );

        assertEquals("cookie-token", input.token());
        assertTrue(input.authCookiePresent());
        assertFalse(input.gatewayRouteHeaderPresent());
        assertEquals("POST", input.method());
    }
}
