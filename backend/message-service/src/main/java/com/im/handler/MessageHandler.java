package com.im.handler;

public interface MessageHandler<T, R> {
    R handle(Long senderId, T request);
}
