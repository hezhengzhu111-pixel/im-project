package com.im.exception;

import com.im.enums.ApiErrorCode;
import org.springframework.http.HttpStatus;

public class BusinessException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private String code;
    private String message;
    private Integer numericCode;
    private HttpStatus httpStatus;
    private transient ApiErrorCode errorCode;

    public BusinessException(String message) {
        super(message);
        this.code = "BUSINESS_ERROR";
        this.message = message;
        this.numericCode = HttpStatus.BAD_REQUEST.value();
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
        this.message = message;
        this.numericCode = HttpStatus.BAD_REQUEST.value();
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(String message, Throwable cause) {
        super(message, cause);
        this.code = "BUSINESS_ERROR";
        this.message = message;
        this.numericCode = HttpStatus.BAD_REQUEST.value();
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.message = message;
        this.numericCode = HttpStatus.BAD_REQUEST.value();
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(ApiErrorCode errorCode) {
        this(errorCode, errorCode == null ? null : errorCode.getMessage());
    }

    public BusinessException(ApiErrorCode errorCode, Throwable cause) {
        this(errorCode, errorCode == null ? null : errorCode.getMessage(), cause);
    }

    public BusinessException(ApiErrorCode errorCode, String message) {
        super(message == null && errorCode != null ? errorCode.getMessage() : message);
        applyErrorCode(errorCode, message);
    }

    public BusinessException(ApiErrorCode errorCode, String message, Throwable cause) {
        super(message == null && errorCode != null ? errorCode.getMessage() : message, cause);
        applyErrorCode(errorCode, message);
    }

    private void applyErrorCode(ApiErrorCode errorCode, String message) {
        this.errorCode = errorCode;
        this.code = errorCode == null ? "BUSINESS_ERROR" : errorCode.getMessage();
        this.message = message == null
                ? (errorCode == null ? null : errorCode.getMessage())
                : message;
        this.numericCode = errorCode == null ? HttpStatus.BAD_REQUEST.value() : errorCode.getCode();
        this.httpStatus = errorCode == null ? HttpStatus.BAD_REQUEST : errorCode.getHttpStatus();
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Integer getNumericCode() {
        return numericCode;
    }

    public void setNumericCode(Integer numericCode) {
        this.numericCode = numericCode;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    public void setHttpStatus(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public ApiErrorCode getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(ApiErrorCode errorCode) {
        this.errorCode = errorCode;
    }

    @Override
    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
