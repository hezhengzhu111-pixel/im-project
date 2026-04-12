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

import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import com.im.dto.response.FileUploadResponse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class FileControllerTest {

    @Mock
    private StorageService storageService;

    @InjectMocks
    private FileController fileController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(fileController, "imageMaxSize", 5 * 1024 * 1024L);
        ReflectionTestUtils.setField(fileController, "fileMaxSize", 10 * 1024 * 1024L);
        ReflectionTestUtils.setField(fileController, "audioMaxSize", 20 * 1024 * 1024L);
        ReflectionTestUtils.setField(fileController, "videoMaxSize", 50 * 1024 * 1024L);
        ReflectionTestUtils.setField(fileController, "avatarMaxSize", 2 * 1024 * 1024L);
    }

    @Test
    void uploadFileReturnsSuccess() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "test.pdf", "application/pdf", "test".getBytes());
        FileUploadResponse uploadResponse = new FileUploadResponse();
        uploadResponse.setUrl("url");
        when(storageService.upload(any(MultipartFile.class), anyString(), anyLong())).thenReturn(uploadResponse);

        ApiResponse<FileUploadResponse> response = fileController.uploadFile(file, 1L);

        assertEquals(200, response.getCode());
        assertEquals("url", response.getData().getUrl());
    }

    @Test
    void uploadVideoReturnsBadRequestWhenOversized() {
        byte[] payload = new byte[11];
        MockMultipartFile file = new MockMultipartFile("file", "test.mp4", "video/mp4", payload);
        ReflectionTestUtils.setField(fileController, "videoMaxSize", 10L);

        ApiResponse<FileUploadResponse> response = fileController.uploadVideo(file, 1L);

        assertEquals(400, response.getCode());
    }

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
