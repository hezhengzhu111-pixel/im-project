package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.request.DeleteFileRequest;
import com.im.dto.request.DownloadFileRequest;
import com.im.dto.request.GetFileInfoRequest;
import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import com.im.service.StorageObject;
import com.im.service.StorageService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Validated
@RestController
@RequestMapping("/")
@RequiredArgsConstructor
public class FileController {

    private static final int BUFFER_SIZE = 8192;

    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/bmp"
    );

    private static final Set<String> ALLOWED_FILE_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "application/zip",
            "application/x-zip-compressed",
            "application/x-rar-compressed",
            "application/vnd.rar"
    );

    private static final Set<String> ALLOWED_AUDIO_TYPES = Set.of(
            "audio/mpeg",
            "audio/mp3",
            "audio/mpeg3",
            "audio/wav",
            "audio/x-wav",
            "audio/wave",
            "audio/ogg",
            "audio/aac",
            "audio/webm",
            "audio/mp4",
            "audio/x-m4a"
    );

    private static final Set<String> ALLOWED_VIDEO_TYPES = Set.of(
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-msvideo",
            "video/x-ms-wmv",
            "video/x-flv",
            "video/avi",
            "video/mov",
            "video/wmv",
            "video/flv"
    );

    private final StorageService storageService;

    @Value("${app.file.image-max-size:5242880}")
    private long imageMaxSize;

    @Value("${app.file.file-max-size:10485760}")
    private long fileMaxSize;

    @Value("${app.file.audio-max-size:20971520}")
    private long audioMaxSize;

    @Value("${app.file.video-max-size:52428800}")
    private long videoMaxSize;

    @Value("${app.file.avatar-max-size:2097152}")
    private long avatarMaxSize;

    @PostMapping("/upload/image")
    public ApiResponse<FileUploadResponse> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        return handleUpload(file, userId, "images", "image", ALLOWED_IMAGE_TYPES, imageMaxSize);
    }

    @PostMapping("/upload/file")
    public ApiResponse<FileUploadResponse> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        return handleUpload(file, userId, "files", "file", ALLOWED_FILE_TYPES, fileMaxSize);
    }

    @PostMapping("/upload/audio")
    public ApiResponse<FileUploadResponse> uploadAudio(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        return handleUpload(file, userId, "audios", "audio", ALLOWED_AUDIO_TYPES, audioMaxSize);
    }

    @PostMapping("/upload/video")
    public ApiResponse<FileUploadResponse> uploadVideo(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        return handleUpload(file, userId, "videos", "video", ALLOWED_VIDEO_TYPES, videoMaxSize);
    }

    @PostMapping("/upload/avatar")
    public ApiResponse<FileUploadResponse> uploadAvatar(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        return handleUpload(file, userId, "avatars", "avatar", ALLOWED_IMAGE_TYPES, avatarMaxSize);
    }

    @GetMapping("/download")
    public void downloadFileByQuery(@Valid DownloadFileRequest request, HttpServletResponse response) {
        streamFile(request, response);
    }

    @PostMapping("/download")
    public void downloadFile(@Valid @RequestBody DownloadFileRequest request, HttpServletResponse response) {
        streamFile(request, response);
    }

    @PostMapping("/info")
    public ApiResponse<FileInfoResponse> getFileInfo(@Valid @RequestBody GetFileInfoRequest request) {
        try {
            FileInfoResponse fileInfo = storageService.getFileInfo(
                    request.getCategory(),
                    request.getDate(),
                    request.getFilename()
            );
            if (fileInfo == null) {
                return ApiResponse.notFound("File not found");
            }
            return ApiResponse.success("File info loaded", fileInfo);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid file info request: {}/{}/{} - {}",
                    request.getCategory(), request.getDate(), request.getFilename(), e.getMessage());
            return ApiResponse.badRequest(e.getMessage());
        } catch (Exception e) {
            log.error("Failed to load file info: {}/{}/{}", request.getCategory(), request.getDate(), request.getFilename(), e);
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    public ApiResponse<Boolean> deleteFile(@Valid DeleteFileRequest request) {
        try {
            boolean deleted = storageService.deleteObject(
                    request.getCategory(),
                    request.getDate(),
                    request.getFilename()
            );
            if (!deleted) {
                return ApiResponse.notFound("File not found");
            }
            return ApiResponse.success("File deleted", true);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid delete request: {}/{}/{} - {}",
                    request.getCategory(), request.getDate(), request.getFilename(), e.getMessage());
            return ApiResponse.badRequest(e.getMessage());
        } catch (Exception e) {
            log.error("Failed to delete file: {}/{}/{}", request.getCategory(), request.getDate(), request.getFilename(), e);
            return ApiResponse.error(e.getMessage());
        }
    }

    private ApiResponse<FileUploadResponse> handleUpload(
            MultipartFile file,
            Long userId,
            String category,
            String fileTypeName,
            Set<String> allowedTypes,
            long maxSize
    ) {
        try {
            validateFile(file, allowedTypes, fileTypeName, maxSize);
            FileUploadResponse fileInfo = storageService.upload(file, category, userId);
            return ApiResponse.success(fileTypeName + " upload success", fileInfo);
        } catch (IllegalArgumentException e) {
            log.warn("{} upload validation failed: {}", fileTypeName, e.getMessage());
            return ApiResponse.badRequest(e.getMessage());
        } catch (Exception e) {
            log.error("{} upload failed", fileTypeName, e);
            return ApiResponse.error(e.getMessage());
        }
    }

    private void streamFile(DownloadFileRequest request, HttpServletResponse response) {
        try {
            StorageObject storageObject = storageService.getObject(
                    request.getCategory(),
                    request.getDate(),
                    request.getFilename()
            );
            if (storageObject == null) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                return;
            }

            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(StringUtils.hasText(storageObject.getContentType())
                    ? storageObject.getContentType()
                    : MediaType.APPLICATION_OCTET_STREAM_VALUE);
            if (storageObject.getContentLength() != null && storageObject.getContentLength() >= 0) {
                response.setContentLengthLong(storageObject.getContentLength());
            }
            response.setHeader("Content-Disposition", "inline; filename=\"" + request.getFilename() + "\"");

            try (InputStream inputStream = storageObject.getInputStream();
                 OutputStream outputStream = response.getOutputStream()) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
                outputStream.flush();
            } finally {
                storageObject.close();
            }
        } catch (IllegalArgumentException e) {
            log.warn("Invalid download request: {}/{}/{} - {}",
                    request.getCategory(), request.getDate(), request.getFilename(), e.getMessage());
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
        } catch (Exception e) {
            log.error("Failed to download file: {}/{}/{}", request.getCategory(), request.getDate(), request.getFilename(), e);
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        }
    }

    private void validateFile(MultipartFile file, Set<String> allowedTypes, String fileTypeName, long maxSize) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(fileTypeName + " file must not be empty");
        }

        if (file.getSize() > maxSize) {
            throw new IllegalArgumentException(fileTypeName + " file size must not exceed " + formatLimit(maxSize));
        }

        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !allowedTypes.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("Unsupported " + fileTypeName + " content type");
        }

        String originalFilename = file.getOriginalFilename();
        if (!StringUtils.hasText(originalFilename)) {
            throw new IllegalArgumentException("File name must not be empty");
        }
    }

    private String formatLimit(long size) {
        if (size >= 1024L * 1024L) {
            return (size / 1024L / 1024L) + "MB";
        }
        if (size >= 1024L) {
            return (size / 1024L) + "KB";
        }
        return size + "B";
    }
}
