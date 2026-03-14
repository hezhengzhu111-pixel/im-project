package com.im.controller;

import com.im.exception.GlobalExceptionHandler;
import com.im.service.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class FileControllerDeleteEndpointTest {

    @Mock
    private StorageService storageService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        FileController fileController = new FileController(storageService);
        this.mockMvc = MockMvcBuilders
                .standaloneSetup(fileController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void returnsBadRequestWhenRequiredParamMissing() throws Exception {
        mockMvc.perform(delete("/delete")
                        .param("category", "images")
                        .param("date", "2026-03-13"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void returnsSuccessWhenRequestValidAndDeleted() throws Exception {
        when(storageService.deleteObject("images", "2026-03-13", "a.png")).thenReturn(true);

        mockMvc.perform(delete("/delete")
                        .param("category", "images")
                        .param("date", "2026-03-13")
                        .param("filename", "a.png"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").value(true));
    }
}
