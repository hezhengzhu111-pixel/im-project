package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.request.DownloadFileRequest;
import com.im.dto.request.GetFileInfoRequest;
import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import com.im.service.StorageObject;
import com.im.service.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.OutputStream;
import java.util.Set;

/**
 * 文件上传控制器
 */
@Slf4j
@RestController
@RequestMapping("/")
@RequiredArgsConstructor
public class FileController {

    private final StorageService storageService;
    
    @Value("${app.file.max-size:10485760}") // 10MB
    private long maxFileSize;
    
    // 支持的图片格式
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"
    );
    
    // 支持的文件格式
    private static final Set<String> ALLOWED_FILE_TYPES = Set.of(
            "application/pdf", "application/msword", 
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain", "application/zip", "application/x-rar-compressed"
    );
    
    // 支持的音频格式
    private static final Set<String> ALLOWED_AUDIO_TYPES = Set.of(
            "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac", "audio/webm"
    );
    
    // 支持的视频格式
    private static final Set<String> ALLOWED_VIDEO_TYPES = Set.of(
            "video/mp4", "video/avi", "video/mov", "video/wmv", "video/flv"
    );
    
    /**
     * 上传图片
     */
    @PostMapping("/upload/image")
    public ApiResponse<FileUploadResponse> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        
        try {
            // 验证文件
            validateFile(file, ALLOWED_IMAGE_TYPES, "图片");
            
            // 保存文件
            FileUploadResponse fileInfo = storageService.upload(file, "images", userId);
            
            return ApiResponse.success("图片上传成功", fileInfo);
        } catch (Exception e) {
            log.error("图片上传失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 上传文件
     */
    @PostMapping("/upload/file")
    public ApiResponse<FileUploadResponse> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        
        try {
            // 验证文件
            validateFile(file, ALLOWED_FILE_TYPES, "文件");
            
            // 保存文件
            FileUploadResponse fileInfo = storageService.upload(file, "files", userId);
            
            return ApiResponse.success("文件上传成功", fileInfo);
        } catch (Exception e) {
            log.error("文件上传失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 上传音频
     */
    @PostMapping("/upload/audio")
    public ApiResponse<FileUploadResponse> uploadAudio(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        
        try {
            // 验证文件
            validateFile(file, ALLOWED_AUDIO_TYPES, "音频");
            
            // 保存文件
            FileUploadResponse fileInfo = storageService.upload(file, "audios", userId);
            
            return ApiResponse.success("音频上传成功", fileInfo);
        } catch (Exception e) {
            log.error("音频上传失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 上传视频
     */
    @PostMapping("/upload/video")
    public ApiResponse<FileUploadResponse> uploadVideo(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        
        try {
            // 验证文件
            validateFile(file, ALLOWED_VIDEO_TYPES, "视频");
            
            // 保存文件
            FileUploadResponse fileInfo = storageService.upload(file, "videos", userId);
            
            return ApiResponse.success("视频上传成功", fileInfo);
        } catch (Exception e) {
            log.error("视频上传失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 上传头像
     */
    @PostMapping("/upload/avatar")
    public ApiResponse<FileUploadResponse> uploadAvatar(
            @RequestParam("file") MultipartFile file,
            @RequestAttribute("userId") Long userId) {
        
        try {
            // 验证文件
            validateFile(file, ALLOWED_IMAGE_TYPES, "头像");
            
            // 头像文件大小限制为2MB
            if (file.getSize() > 2 * 1024 * 1024) {
                return ApiResponse.badRequest("头像文件大小不能超过2MB");
            }
            
            // 保存文件
            FileUploadResponse fileInfo = storageService.upload(file, "avatars", userId);
            
            return ApiResponse.success("头像上传成功", fileInfo);
        } catch (Exception e) {
            log.error("头像上传失败", e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 下载文件
     */
    @PostMapping("/download")
    public void downloadFile(
            @Valid @RequestBody DownloadFileRequest request,
            HttpServletResponse response) {
        
        try {
            StorageObject obj = storageService.getObject(request.getCategory(), request.getDate(), request.getFilename());
            if (obj == null) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                return;
            }
            try (obj; OutputStream os = response.getOutputStream()) {
                if (StringUtils.hasText(obj.getContentType())) {
                    response.setContentType(obj.getContentType());
                }
                if (obj.getContentLength() != null && obj.getContentLength() > 0) {
                    response.setContentLengthLong(obj.getContentLength());
                }
                response.setHeader("Content-Disposition", "inline; filename=\"" + request.getFilename() + "\"");

                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = obj.getInputStream().read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
                os.flush();
            }
            
        } catch (Exception e) {
            log.error("文件下载失败: {}/{}/{}", request.getCategory(), request.getDate(), request.getFilename(), e);
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        }
    }
    
    /**
     * 获取文件信息
     */
    @PostMapping("/info")
    public ApiResponse<FileInfoResponse> getFileInfo(
            @Valid @RequestBody GetFileInfoRequest request) {
        
        try {
            FileInfoResponse fileInfo = storageService.getFileInfo(request.getCategory(), request.getDate(), request.getFilename());
            
            return ApiResponse.success("获取文件信息成功", fileInfo);
        } catch (Exception e) {
            log.error("获取文件信息失败: {}/{}/{}", request.getCategory(), request.getDate(), request.getFilename(), e);
            return ApiResponse.error(e.getMessage());
        }
    }
    
    /**
     * 验证文件
     */
    private void validateFile(MultipartFile file, Set<String> allowedTypes, String fileTypeName) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(fileTypeName + "文件不能为空");
        }
        
        if (file.getSize() > maxFileSize) {
            throw new IllegalArgumentException(fileTypeName + "文件大小不能超过" + (maxFileSize / 1024 / 1024) + "MB");
        }
        
        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !allowedTypes.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("不支持的" + fileTypeName + "格式");
        }
        
        String originalFilename = file.getOriginalFilename();
        if (!StringUtils.hasText(originalFilename)) {
            throw new IllegalArgumentException("文件名不能为空");
        }
    }
    
    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex > 0 ? filename.substring(lastDotIndex) : "";
    }
}
