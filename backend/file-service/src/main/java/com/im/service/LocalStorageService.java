package com.im.service;

import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
@ConditionalOnProperty(name = "im.cos.enabled", havingValue = "false")
public class LocalStorageService implements StorageService {

    @Value("${im.storage.local.base-dir:/data/im-files}")
    private String baseDir;

    @Override
    public FileUploadResponse upload(MultipartFile file, String category, Long userId) throws Exception {
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        String filename = UUID.randomUUID().toString() + extension;
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

        Path target = resolvePath(category, dateStr, filename);
        Files.createDirectories(target.getParent());

        try (InputStream is = file.getInputStream()) {
            Files.copy(is, target, StandardCopyOption.REPLACE_EXISTING);
        }

        String url = "/api/file/download";
        return new FileUploadResponse(
                originalFilename,
                filename,
                url,
                file.getSize(),
                file.getContentType(),
                category,
                dateStr,
                System.currentTimeMillis(),
                userId
        );
    }

    @Override
    public FileInfoResponse getFileInfo(String category, String date, String filename) {
        try {
            Path path = resolvePath(category, date, filename);
            if (!Files.exists(path)) {
                return new FileInfoResponse(filename, 0L, null, null);
            }
            long size = Files.size(path);
            String contentType = Files.probeContentType(path);
            long lastModified = Files.getLastModifiedTime(path).toMillis();
            return new FileInfoResponse(filename, size, contentType, lastModified);
        } catch (Exception e) {
            return new FileInfoResponse(filename, 0L, null, null);
        }
    }

    @Override
    public StorageObject getObject(String category, String date, String filename) throws Exception {
        Path path = resolvePath(category, date, filename);
        if (!Files.exists(path)) {
            return null;
        }
        InputStream is = Files.newInputStream(path);
        String contentType = Files.probeContentType(path);
        Long length = Files.size(path);
        return new StorageObject(is, contentType, length);
    }

    private Path resolvePath(String category, String date, String filename) {
        String cat = safeSegment(category);
        String d = safeSegment(date);
        String fn = safeSegment(filename);
        return Path.of(baseDir).resolve(cat).resolve(d).resolve(fn);
    }

    private String safeSegment(String s) {
        if (!StringUtils.hasText(s)) {
            return "_";
        }
        return s.replace("..", "_").replace("\\", "_").replace("/", "_").trim();
    }

    private String getFileExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex > 0 ? filename.substring(lastDotIndex) : "";
    }
}

