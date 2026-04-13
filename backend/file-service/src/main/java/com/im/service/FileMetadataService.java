package com.im.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.response.FileUploadResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileMetadataService {

    private static final String KEY_PREFIX = "file:meta:";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    public void save(FileUploadResponse uploadResponse) {
        if (uploadResponse == null) {
            return;
        }
        FileMetadata metadata = new FileMetadata();
        metadata.setCategory(uploadResponse.getCategory());
        metadata.setDate(uploadResponse.getUploadDate());
        metadata.setFilename(uploadResponse.getFilename());
        metadata.setOriginalFilename(uploadResponse.getOriginalFilename());
        metadata.setUploaderId(toLong(uploadResponse.getUploaderId()));
        metadata.setSize(uploadResponse.getSize());
        metadata.setContentType(uploadResponse.getContentType());
        metadata.setCreatedAt(uploadResponse.getUploadTime());
        save(metadata);
    }

    public void save(FileMetadata metadata) {
        if (metadata == null || metadata.getUploaderId() == null) {
            return;
        }
        try {
            stringRedisTemplate.opsForValue().set(key(metadata.getCategory(), metadata.getDate(), metadata.getFilename()),
                    objectMapper.writeValueAsString(metadata));
        } catch (Exception e) {
            log.warn("failed to save file metadata: {}/{}/{}",
                    metadata.getCategory(), metadata.getDate(), metadata.getFilename(), e);
        }
    }

    public FileMetadata get(String category, String date, String filename) {
        try {
            String raw = stringRedisTemplate.opsForValue().get(key(category, date, filename));
            if (raw == null || raw.isBlank()) {
                return null;
            }
            return objectMapper.readValue(raw, FileMetadata.class);
        } catch (Exception e) {
            log.warn("failed to load file metadata: {}/{}/{}", category, date, filename, e);
            return null;
        }
    }

    public void delete(String category, String date, String filename) {
        stringRedisTemplate.delete(key(category, date, filename));
    }

    private String key(String category, String date, String filename) {
        return KEY_PREFIX + safe(category) + ":" + safe(date) + ":" + safe(filename);
    }

    private String safe(String value) {
        return value == null ? "_" : value.trim();
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null ? null : Long.valueOf(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }
}
