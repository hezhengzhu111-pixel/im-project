package com.im.enums;

import org.springframework.http.HttpStatus;

public interface ApiErrorCode {

    int getCode();

    String getMessage();

    HttpStatus getHttpStatus();
}
