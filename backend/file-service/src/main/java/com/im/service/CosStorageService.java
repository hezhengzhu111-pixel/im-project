package com.im.service;

import com.im.config.CosProperties;
import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.COSObject;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.model.PutObjectRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "im.cos.enabled", havingValue = "true", matchIfMissing = true)
public class CosStorageService implements StorageService {

    private final COSClient cosClient;
    private final CosProperties props;

    public FileUploadResponse upload(MultipartFile file, String category, Long userId) throws Exception {
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        String filename = UUID.randomUUID().toString() + extension;
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

        String key = buildKey(category, dateStr, filename);

        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(file.getSize());
        if (StringUtils.hasText(file.getContentType())) {
            metadata.setContentType(file.getContentType());
        }
        metadata.addUserMetadata("uploader-id", String.valueOf(userId));

        try (InputStream inputStream = file.getInputStream()) {
            PutObjectRequest putObjectRequest = new PutObjectRequest(props.getBucket(), key, inputStream, metadata);
            cosClient.putObject(putObjectRequest);
        }

        String url = buildPublicUrl(key);
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

    public FileInfoResponse getFileInfo(String category, String date, String filename) {
        String key = buildKey(category, date, filename);
        ObjectMetadata metadata = cosClient.getObjectMetadata(props.getBucket(), key);
        Long size = metadata == null ? 0L : metadata.getContentLength();
        String contentType = metadata == null ? null : metadata.getContentType();
        Long lastModified = metadata == null || metadata.getLastModified() == null ? null : metadata.getLastModified().getTime();
        return new FileInfoResponse(filename, size, contentType, lastModified);
    }

    @Override
    public StorageObject getObject(String category, String date, String filename) throws Exception {
        String key = buildKey(category, date, filename);
        COSObject cosObject = cosClient.getObject(props.getBucket(), key);
        if (cosObject == null) {
            return null;
        }
        ObjectMetadata metadata = cosObject.getObjectMetadata();
        String contentType = metadata == null ? null : metadata.getContentType();
        Long len = metadata == null ? null : metadata.getContentLength();
        return new StorageObject(cosObject.getObjectContent(), contentType, len, cosObject);
    }

    public String buildPublicUrl(String key) {
        String normalizedKey = key.startsWith("/") ? key.substring(1) : key;
        if (StringUtils.hasText(props.getPublicDomain())) {
            String domain = props.getPublicDomain().endsWith("/") ? props.getPublicDomain().substring(0, props.getPublicDomain().length() - 1) : props.getPublicDomain();
            return domain + "/" + normalizedKey;
        }
        String protocol = props.isHttps() ? "https" : "http";
        return String.format("%s://%s.cos.%s.myqcloud.com/%s", protocol, props.getBucket(), props.getRegion(), normalizedKey);
    }

    private String buildKey(String category, String date, String filename) {
        String prefix = props.getPathPrefix();
        String base = (prefix == null ? "" : prefix.trim());
        if (base.startsWith("/")) {
            base = base.substring(1);
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String key = String.format("%s/%s/%s", category, date, filename);
        if (base.isEmpty()) {
            return key;
        }
        return base + "/" + key;
    }

    private String getFileExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex > 0 ? filename.substring(lastDotIndex) : "";
    }
}

