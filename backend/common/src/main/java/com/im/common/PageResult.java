package com.im.common;

import lombok.Data;

import java.util.List;

@Data
public class PageResult<T> {
    private List<T> content;
    private Long total;
    private Long current;
    private Long size;
    private String cursor;
    private Boolean hasNext;

    public PageResult() {}

    public PageResult(List<T> content, Long total, Long current, Long size) {
        this.content = content;
        this.total = total;
        this.current = current;
        this.size = size;
    }

    public PageResult(List<T> content, String cursor, Boolean hasNext) {
        this.content = content;
        this.cursor = cursor;
        this.hasNext = hasNext;
    }

    public static <T> PageResult<T> of(List<T> content, Long total, Long current, Long size) {
        return new PageResult<>(content, total, current, size);
    }

    public static <T> PageResult<T> of(List<T> content, String cursor, Boolean hasNext) {
        return new PageResult<>(content, cursor, hasNext);
    }
}