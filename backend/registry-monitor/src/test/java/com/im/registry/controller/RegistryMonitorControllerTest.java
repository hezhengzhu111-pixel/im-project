package com.im.registry.controller;

import com.im.registry.model.RegistryAlert;
import com.im.registry.service.RegistryPoller;
import com.im.registry.service.RegistryState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class RegistryMonitorControllerTest {

    private MockMvc mockMvc;

    @Mock
    private RegistryPoller registryPoller;

    @Mock
    private RegistryState registryState;

    @InjectMocks
    private RegistryMonitorController controller;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        when(registryPoller.getState()).thenReturn(registryState);
    }

    @Test
    void services_ShouldReturnCounts() throws Exception {
        Map<String, Integer> counts = new HashMap<>();
        counts.put("im-server", 2);
        when(registryState.getCountsSnapshot()).thenReturn(counts);

        mockMvc.perform(get("/services"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.im-server").value(2));
    }

    @Test
    void alerts_ShouldReturnAlerts() throws Exception {
        RegistryAlert alert = new RegistryAlert(java.time.Instant.now(), "im-server", 5, 2, 0.4, "down");
        when(registryState.getAlertsSnapshot()).thenReturn(Collections.singletonList(alert));

        mockMvc.perform(get("/alerts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].serviceName").value("im-server"))
                .andExpect(jsonPath("$[0].message").value("down"))
                .andExpect(jsonPath("$[0].previousCount").value(5));
    }
}
