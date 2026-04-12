package com.im.service;

import com.im.dto.response.FileUploadResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocalStorageServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void uploadReturnsResolvableDownloadUrl() throws Exception {
        LocalStorageService localStorageService = new LocalStorageService();
        ReflectionTestUtils.setField(localStorageService, "baseDir", tempDir.toString());

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "report.pdf",
                "application/pdf",
                "payload".getBytes()
        );

        FileUploadResponse response = localStorageService.upload(file, "files", 1L);

        assertNotNull(response);
        assertTrue(response.getUrl().startsWith("/api/file/download?category=files&date="));
        assertTrue(response.getUrl().contains("&filename="));
        assertNotNull(localStorageService.getObject("files", response.getUploadDate(), response.getFilename()));
        assertTrue(Files.exists(tempDir.resolve("files").resolve(response.getUploadDate()).resolve(response.getFilename())));
    }
}
