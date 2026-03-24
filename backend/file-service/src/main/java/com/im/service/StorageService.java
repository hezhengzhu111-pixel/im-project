package com.im.service;

import com.im.dto.response.FileInfoResponse;
import com.im.dto.response.FileUploadResponse;
import org.springframework.web.multipart.MultipartFile;

public interface StorageService {

    FileUploadResponse upload(MultipartFile file, String category, Long userId) throws Exception;

    FileInfoResponse getFileInfo(String category, String date, String filename);

    StorageObject getObject(String category, String date, String filename) throws Exception;

    boolean deleteObject(String category, String date, String filename) throws Exception;
}

