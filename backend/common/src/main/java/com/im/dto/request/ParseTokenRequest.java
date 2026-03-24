package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;

@Data
public class ParseTokenRequest {
    @NotBlank
    private String token;

    private Boolean allowExpired;
}

