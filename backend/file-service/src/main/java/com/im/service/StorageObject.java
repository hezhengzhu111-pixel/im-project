package com.im.service;

import java.io.InputStream;

public class StorageObject implements AutoCloseable {

    private final InputStream inputStream;
    private final String contentType;
    private final Long contentLength;
    private final AutoCloseable closeable;

    public StorageObject(InputStream inputStream, String contentType, Long contentLength) {
        this(inputStream, contentType, contentLength, null);
    }

    public StorageObject(InputStream inputStream, String contentType, Long contentLength, AutoCloseable closeable) {
        this.inputStream = inputStream;
        this.contentType = contentType;
        this.contentLength = contentLength;
        this.closeable = closeable;
    }

    public InputStream getInputStream() {
        return inputStream;
    }

    public String getContentType() {
        return contentType;
    }

    public Long getContentLength() {
        return contentLength;
    }

    @Override
    public void close() throws Exception {
        if (inputStream != null) {
            inputStream.close();
        }
        if (closeable != null) {
            closeable.close();
        }
    }
}

