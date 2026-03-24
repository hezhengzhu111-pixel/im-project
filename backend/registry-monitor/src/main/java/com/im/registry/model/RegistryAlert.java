package com.im.registry.model;

import lombok.Value;

import java.time.Instant;

@Value
public class RegistryAlert {
    Instant timestamp;
    String serviceName;
    int previousCount;
    int currentCount;
    double ratio;
    String message;
}

