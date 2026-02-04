package com.im.util;

import org.apache.commons.io.FilenameUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 文件工具类
 * 提供文件上传、下载、验证等功能
 * 
 * @author IM Team
 * @since 2024-01-01
 */
@Component
public class FileUtil {

    private static final Logger logger = LoggerFactory.getLogger(FileUtil.class);

    @Value("${file.upload.path:./uploads/}")
    private String uploadPath;

    @Value("${file.upload.max-size:10485760}") // 10MB
    private long maxFileSize;

    @Value("${file.upload.allowed-types:jpg,jpeg,png,gif,pdf,doc,docx,txt,mp3,mp4,wav}")
    private String allowedTypes;

    // 图片文件扩展名
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
        "jpg", "jpeg", "png", "gif", "bmp", "webp"
    );

    // 音频文件扩展名
    private static final Set<String> AUDIO_EXTENSIONS = Set.of(
        "mp3", "wav", "aac", "flac", "ogg", "m4a"
    );

    // 视频文件扩展名
    private static final Set<String> VIDEO_EXTENSIONS = Set.of(
        "mp4", "avi", "mov", "wmv", "flv", "mkv", "webm"
    );

    // 文档文件扩展名
    private static final Set<String> DOCUMENT_EXTENSIONS = Set.of(
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"
    );

    /**
     * 上传文件
     * 
     * @param file 上传的文件
     * @param subDir 子目录（如：images, files, avatars等）
     * @return 文件相对路径
     * @throws IOException 上传失败异常
     */
    public String uploadFile(MultipartFile file, String subDir) throws IOException {
        // 验证文件
        validateFile(file);
        
        // 生成文件名
        String fileName = generateFileName(file.getOriginalFilename());
        
        // 构建文件路径
        String datePath = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String relativePath = subDir + "/" + datePath + "/" + fileName;
        String fullPath = uploadPath + relativePath;
        
        // 创建目录
        Path targetPath = Paths.get(fullPath);
        Files.createDirectories(targetPath.getParent());
        
        // 保存文件
        file.transferTo(targetPath.toFile());
        
        logger.info("文件上传成功: {} -> {}", file.getOriginalFilename(), relativePath);
        return relativePath;
    }

    /**
     * 上传头像文件
     * 
     * @param file 头像文件
     * @param userId 用户ID
     * @return 头像相对路径
     * @throws IOException 上传失败异常
     */
    public String uploadAvatar(MultipartFile file, Long userId) throws IOException {
        // 验证是否为图片文件
        if (!isImageFile(file)) {
            throw new IllegalArgumentException("头像必须是图片文件");
        }
        
        // 验证文件大小（头像限制更小，比如2MB）
        if (file.getSize() > 2 * 1024 * 1024) {
            throw new IllegalArgumentException("头像文件大小不能超过2MB");
        }
        
        // 生成头像文件名
        String extension = getFileExtension(file.getOriginalFilename());
        String fileName = "avatar_" + userId + "_" + System.currentTimeMillis() + "." + extension;
        
        // 构建文件路径
        String relativePath = "avatars/" + fileName;
        String fullPath = uploadPath + relativePath;
        
        // 创建目录
        Path targetPath = Paths.get(fullPath);
        Files.createDirectories(targetPath.getParent());
        
        // 保存文件
        file.transferTo(targetPath.toFile());
        
        logger.info("头像上传成功: 用户 {} -> {}", userId, relativePath);
        return relativePath;
    }

    /**
     * 删除文件
     * 
     * @param relativePath 文件相对路径
     * @return 是否删除成功
     */
    public boolean deleteFile(String relativePath) {
        try {
            if (relativePath == null || relativePath.trim().isEmpty()) {
                return false;
            }
            
            Path filePath = Paths.get(uploadPath + relativePath);
            boolean deleted = Files.deleteIfExists(filePath);
            
            if (deleted) {
                logger.info("文件删除成功: {}", relativePath);
            } else {
                logger.warn("文件不存在或删除失败: {}", relativePath);
            }
            
            return deleted;
        } catch (IOException e) {
            logger.error("删除文件失败: {}", relativePath, e);
            return false;
        }
    }

    /**
     * 获取文件完整路径
     * 
     * @param relativePath 相对路径
     * @return 完整路径
     */
    public String getFullPath(String relativePath) {
        if (relativePath == null) {
            return null;
        }
        return uploadPath + relativePath;
    }

    /**
     * 检查文件是否存在
     * 
     * @param relativePath 相对路径
     * @return 是否存在
     */
    public boolean fileExists(String relativePath) {
        if (relativePath == null) {
            return false;
        }
        return Files.exists(Paths.get(uploadPath + relativePath));
    }

    /**
     * 获取文件大小
     * 
     * @param relativePath 相对路径
     * @return 文件大小（字节）
     */
    public long getFileSize(String relativePath) {
        try {
            if (relativePath == null) {
                return 0;
            }
            return Files.size(Paths.get(uploadPath + relativePath));
        } catch (IOException e) {
            logger.error("获取文件大小失败: {}", relativePath, e);
            return 0;
        }
    }

    /**
     * 获取文件类型
     * 
     * @param fileName 文件名
     * @return 文件类型
     */
    public String getFileType(String fileName) {
        if (fileName == null) {
            return "unknown";
        }
        
        String extension = getFileExtension(fileName).toLowerCase();
        
        if (IMAGE_EXTENSIONS.contains(extension)) {
            return "image";
        } else if (AUDIO_EXTENSIONS.contains(extension)) {
            return "audio";
        } else if (VIDEO_EXTENSIONS.contains(extension)) {
            return "video";
        } else if (DOCUMENT_EXTENSIONS.contains(extension)) {
            return "document";
        } else {
            return "file";
        }
    }

    /**
     * 判断是否为图片文件
     * 
     * @param file 文件
     * @return 是否为图片
     */
    public boolean isImageFile(MultipartFile file) {
        if (file == null || file.getOriginalFilename() == null) {
            return false;
        }
        
        String extension = getFileExtension(file.getOriginalFilename()).toLowerCase();
        return IMAGE_EXTENSIONS.contains(extension);
    }

    /**
     * 判断是否为音频文件
     * 
     * @param file 文件
     * @return 是否为音频
     */
    public boolean isAudioFile(MultipartFile file) {
        if (file == null || file.getOriginalFilename() == null) {
            return false;
        }
        
        String extension = getFileExtension(file.getOriginalFilename()).toLowerCase();
        return AUDIO_EXTENSIONS.contains(extension);
    }

    /**
     * 判断是否为视频文件
     * 
     * @param file 文件
     * @return 是否为视频
     */
    public boolean isVideoFile(MultipartFile file) {
        if (file == null || file.getOriginalFilename() == null) {
            return false;
        }
        
        String extension = getFileExtension(file.getOriginalFilename()).toLowerCase();
        return VIDEO_EXTENSIONS.contains(extension);
    }

    /**
     * 格式化文件大小
     * 
     * @param size 文件大小（字节）
     * @return 格式化后的大小
     */
    public String formatFileSize(long size) {
        if (size < 1024) {
            return size + " B";
        } else if (size < 1024 * 1024) {
            return String.format("%.1f KB", size / 1024.0);
        } else if (size < 1024 * 1024 * 1024) {
            return String.format("%.1f MB", size / (1024.0 * 1024.0));
        } else {
            return String.format("%.1f GB", size / (1024.0 * 1024.0 * 1024.0));
        }
    }

    /**
     * 验证文件
     * 
     * @param file 文件
     * @throws IllegalArgumentException 验证失败异常
     */
    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件不能为空");
        }
        
        if (file.getSize() > maxFileSize) {
            throw new IllegalArgumentException("文件大小不能超过 " + formatFileSize(maxFileSize));
        }
        
        String fileName = file.getOriginalFilename();
        if (fileName == null || fileName.trim().isEmpty()) {
            throw new IllegalArgumentException("文件名不能为空");
        }
        
        String extension = getFileExtension(fileName).toLowerCase();
        Set<String> allowedExtensions = Set.of(allowedTypes.toLowerCase().split(","));
        
        if (!allowedExtensions.contains(extension)) {
            throw new IllegalArgumentException("不支持的文件类型: " + extension + "，支持的类型: " + allowedTypes);
        }
    }

    /**
     * 生成唯一文件名
     * 
     * @param originalFileName 原始文件名
     * @return 新文件名
     */
    private String generateFileName(String originalFileName) {
        String extension = getFileExtension(originalFileName);
        String baseName = FilenameUtils.getBaseName(originalFileName);
        
        // 生成UUID作为文件名
        String uuid = UUID.randomUUID().toString().replace("-", "");
        
        // 保留原始文件名的前缀（最多20个字符）
        if (baseName.length() > 20) {
            baseName = baseName.substring(0, 20);
        }
        
        return baseName + "_" + uuid + "." + extension;
    }

    /**
     * 获取文件扩展名
     * 
     * @param fileName 文件名
     * @return 扩展名
     */
    private String getFileExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) {
            return "";
        }
        return fileName.substring(fileName.lastIndexOf(".") + 1);
    }

    /**
     * 初始化上传目录
     */
    public void initUploadDirectories() {
        try {
            // 创建主上传目录
            Files.createDirectories(Paths.get(uploadPath));
            
            // 创建子目录
            String[] subDirs = {"images", "files", "avatars", "audio", "video", "documents"};
            for (String subDir : subDirs) {
                Files.createDirectories(Paths.get(uploadPath + subDir));
            }
            
            logger.info("上传目录初始化完成: {}", uploadPath);
        } catch (IOException e) {
            logger.error("初始化上传目录失败", e);
            throw new RuntimeException("无法创建上传目录", e);
        }
    }

    // Getter方法
    public String getUploadPath() {
        return uploadPath;
    }

    public long getMaxFileSize() {
        return maxFileSize;
    }

    public String getAllowedTypes() {
        return allowedTypes;
    }
}