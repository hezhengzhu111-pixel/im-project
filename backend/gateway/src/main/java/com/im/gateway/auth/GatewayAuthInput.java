package com.im.gateway.auth;

public record GatewayAuthInput(String path,
                               String token,
                               boolean authCookiePresent,
                               boolean gatewayRouteHeaderPresent,
                               String method) {
}
