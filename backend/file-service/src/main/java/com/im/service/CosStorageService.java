package com.im.service;

import com.im.config.CosProperties;
import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.exception.CosServiceException;
import com.qcloud.cos.model.COSObject;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.model.PutObjectRequest;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "im.cos.enabled", havingValue = "true", matchIfMissing = true)
public class CosStorageService implements StorageService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final COSClient cosClient;
    private final CosProperties props;

    @Override
    public FileUploadResponse upload(MultipartFile file, String category, Long userId) throws Exception {
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        String filename = UUID.randomUUID() + extension;
        String dateStr = LocalDate.now().format(DATE_FORMATTER);
        String key = buildKey(category, dateStr, filename);

        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(file.getSize());
        if (StringUtils.hasText(file.getContentType())) {
            metadata.setContentType(file.getContentType());
        }
        metadata.addUserMetadata("uploader-id", String.valueOf(userId));
        if (StringUtils.hasText(originalFilename)) {
            metadata.addUserMetadata("original-filename", originalFilename);
        }

        try (InputStream inputStream = file.getInputStream()) {
            PutObjectRequest putObjectRequest = new PutObjectRequest(props.getBucket(), key, inputStream, metadata);
            cosClient.putObject(putObjectRequest);
        }

        return new FileUploadResponse(
                originalFilename,
                filename,
                buildPublicUrl(key),
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
        String key = buildKey(category, date, filename);
        try {
            ObjectMetadata metadata = cosClient.getObjectMetadata(props.getBucket(), key);
            if (metadata == null) {
                return null;
            }
            Long lastModified = metadata.getLastModified() == null ? null : metadata.getLastModified().getTime();
            return new FileInfoResponse(filename, metadata.getContentLength(), metadata.getContentType(), lastModified);
        } catch (CosServiceException e) {
            if (isNotFound(e)) {
                return null;
            }
            throw e;
        }
    }

    @Override
    public StorageObject getObject(String category, String date, String filename) throws Exception {
        String key = buildKey(category, date, filename);
        try {
            COSObject cosObject = cosClient.getObject(props.getBucket(), key);
            if (cosObject == null) {
                return null;
            }
            ObjectMetadata metadata = cosObject.getObjectMetadata();
            String contentType = metadata == null ? null : metadata.getContentType();
            Long contentLength = metadata == null ? null : metadata.getContentLength();
            return new StorageObject(cosObject.getObjectContent(), contentType, contentLength, cosObject);
        } catch (CosServiceException e) {
            if (isNotFound(e)) {
                return null;
            }
            throw e;
        }
    }

    @Override
    public boolean deleteObject(String category, String date, String filename) throws Exception {
        String key = buildKey(category, date, filename);
        if (!cosClient.doesObjectExist(props.getBucket(), key)) {
            return false;
        }
        cosClient.deleteObject(props.getBucket(), key);
        return true;
    }

    public String buildPublicUrl(String key) {
        String normalizedKey = key.startsWith("/") ? key.substring(1) : key;
        if (StringUtils.hasText(props.getPublicDomain())) {
            String domain = props.getPublicDomain().endsWith("/")
                    ? props.getPublicDomain().substring(0, props.getPublicDomain().length() - 1)
                    : props.getPublicDomain();
            return domain + "/" + normalizedKey;
        }
        String protocol = props.isHttps() ? "https" : "http";
        return String.format("%s://%s.cos.%s.myqcloud.com/%s",
                protocol,
                props.getBucket(),
                props.getRegion(),
                normalizedKey);
    }

    private String buildKey(String category, String date, String filename) {
        String key = String.format("%s/%s/%s", category, date, filename);
        String base = normalizePrefix(props.getPathPrefix());
        return base.isEmpty() ? key : base + "/" + key;
    }

    private String normalizePrefix(String prefix) {
        if (!StringUtils.hasText(prefix)) {
            return "";
        }
        String normalized = prefix.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private boolean isNotFound(CosServiceException e) {
        return e != null && (e.getStatusCode() == 404 || "NoSuchKey".equalsIgnoreCase(e.getErrorCode()));
    }

    private String getFileExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex > 0 ? filename.substring(lastDotIndex) : "";
    }
}
