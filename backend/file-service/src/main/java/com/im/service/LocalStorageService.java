package com.im.service;

import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.UriComponentsBuilder;

@Slf4j
@Service
@ConditionalOnProperty(name = "im.cos.enabled", havingValue = "false")
public class LocalStorageService implements StorageService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Value("${im.storage.local.base-dir:/data/im-files}")
    private String baseDir;

    @Override
    public FileUploadResponse upload(MultipartFile file, String category, Long userId) throws Exception {
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        String filename = UUID.randomUUID() + extension;
        String dateStr = LocalDate.now().format(DATE_FORMATTER);

        Path target = resolvePath(category, dateStr, filename);
        Files.createDirectories(target.getParent());

        try (InputStream is = file.getInputStream()) {
            Files.copy(is, target, StandardCopyOption.REPLACE_EXISTING);
        }

        String url = UriComponentsBuilder.fromPath("/api/file/download")
                .queryParam("category", category)
                .queryParam("date", dateStr)
                .queryParam("filename", filename)
                .build()
                .encode()
                .toUriString();

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
                return null;
            }
            long size = Files.size(path);
            String contentType = Files.probeContentType(path);
            long lastModified = Files.getLastModifiedTime(path).toMillis();
            return new FileInfoResponse(filename, size, contentType, lastModified);
        } catch (Exception e) {
            log.error("Failed to read file info from local storage: {}/{}/{}", category, date, filename, e);
            throw new IllegalStateException("Failed to read file info", e);
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

    @Override
    public boolean deleteObject(String category, String date, String filename) throws Exception {
        Path path = resolvePath(category, date, filename);
        return Files.deleteIfExists(path);
    }

    private Path resolvePath(String category, String date, String filename) {
        String cat = safeSegment(category);
        String d = safeSegment(date);
        String fn = safeSegment(filename);
        return Path.of(baseDir).resolve(cat).resolve(d).resolve(fn);
    }

    private String safeSegment(String value) {
        if (!StringUtils.hasText(value)) {
            return "_";
        }
        return value.replace("..", "_")
                .replace("\\", "_")
                .replace("/", "_")
                .trim();
    }

    private String getFileExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex > 0 ? filename.substring(lastDotIndex) : "";
    }
}
