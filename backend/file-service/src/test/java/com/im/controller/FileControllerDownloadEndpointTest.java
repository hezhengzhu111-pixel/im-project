package com.im.controller;

import com.im.exception.GlobalExceptionHandler;
import com.im.service.FileMetadata;
import com.im.service.FileMetadataService;
import com.im.service.StorageObject;
import com.im.service.StorageService;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class FileControllerDownloadEndpointTest {

    @Mock
    private StorageService storageService;

    @Mock
    private FileMetadataService fileMetadataService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        FileController fileController = new FileController(storageService, fileMetadataService);
        this.mockMvc = MockMvcBuilders
                .standaloneSetup(fileController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void supportsGetDownloadWithQueryParams() throws Exception {
        byte[] payload = "hello".getBytes(StandardCharsets.UTF_8);
        when(fileMetadataService.get("files", "2026-03-13", "doc.txt")).thenReturn(metadata(1L));
        when(storageService.getObject("files", "2026-03-13", "doc.txt"))
                .thenReturn(new StorageObject(
                        new ByteArrayInputStream(payload),
                        "text/plain",
                        (long) payload.length
                ));

        mockMvc.perform(get("/download")
                        .requestAttr("userId", 1L)
                        .param("category", "files")
                .param("date", "2026-03-13")
                .param("filename", "doc.txt"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "inline; filename=\"doc.txt\""))
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().bytes(payload));
    }

    @Test
    void rejectsDownloadWhenUserIsNotOwner() throws Exception {
        when(fileMetadataService.get("files", "2026-03-13", "doc.txt")).thenReturn(metadata(2L));

        mockMvc.perform(get("/download")
                        .requestAttr("userId", 1L)
                        .param("category", "files")
                        .param("date", "2026-03-13")
                        .param("filename", "doc.txt"))
                .andExpect(status().isForbidden());
    }

    private FileMetadata metadata(Long uploaderId) {
        FileMetadata metadata = new FileMetadata();
        metadata.setUploaderId(uploaderId);
        return metadata;
    }
}
