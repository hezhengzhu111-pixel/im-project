package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.request.DeleteFileRequest;
import com.im.service.StorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileControllerTest {

    @Mock
    private StorageService storageService;

    @InjectMocks
    private FileController fileController;

    @Test
    void deleteFileReturnsSuccessWhenDeleted() throws Exception {
        DeleteFileRequest request = new DeleteFileRequest();
        request.setCategory("images");
        request.setDate("2026-03-13");
        request.setFilename("a.png");
        when(storageService.deleteObject("images", "2026-03-13", "a.png")).thenReturn(true);

        ApiResponse<Boolean> response = fileController.deleteFile(request);

        assertEquals(200, response.getCode());
        assertTrue(Boolean.TRUE.equals(response.getData()));
    }

    @Test
    void deleteFileReturnsNotFoundWhenFileMissing() throws Exception {
        DeleteFileRequest request = new DeleteFileRequest();
        request.setCategory("images");
        request.setDate("2026-03-13");
        request.setFilename("missing.png");
        when(storageService.deleteObject("images", "2026-03-13", "missing.png")).thenReturn(false);

        ApiResponse<Boolean> response = fileController.deleteFile(request);

        assertEquals(404, response.getCode());
    }

    @Test
    void deleteFileReturnsErrorWhenExceptionThrown() throws Exception {
        DeleteFileRequest request = new DeleteFileRequest();
        request.setCategory("images");
        request.setDate("2026-03-13");
        request.setFilename("broken.png");
        when(storageService.deleteObject("images", "2026-03-13", "broken.png"))
                .thenThrow(new RuntimeException("boom"));

        ApiResponse<Boolean> response = fileController.deleteFile(request);

        assertEquals(500, response.getCode());
    }
}
