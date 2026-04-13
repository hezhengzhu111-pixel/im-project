package com.im.service;

import lombok.Data;

@Data
public class FileMetadata {
    private String category;
    private String date;
    private String filename;
    private String originalFilename;
    private Long uploaderId;
    private Long size;
    private String contentType;
    private Long createdAt;
}
