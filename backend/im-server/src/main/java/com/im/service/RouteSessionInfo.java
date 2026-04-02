package com.im.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RouteSessionInfo {
    private String instanceId;
    private String sessionId;
}
