package com.im.registry.controller;

import com.im.registry.model.RegistryAlert;
import com.im.registry.service.RegistryPoller;
import com.im.registry.service.RegistryState;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/")
@RequiredArgsConstructor
public class RegistryMonitorController {

    private final RegistryPoller registryPoller;

    @GetMapping("/services")
    public Map<String, Integer> services() {
        RegistryState state = registryPoller.getState();
        return state.getCountsSnapshot();
    }

    @GetMapping("/alerts")
    public List<RegistryAlert> alerts() {
        RegistryState state = registryPoller.getState();
        return state.getAlertsSnapshot();
    }
}

