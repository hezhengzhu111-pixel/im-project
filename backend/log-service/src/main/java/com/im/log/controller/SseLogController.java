package com.im.log.controller;

import com.im.util.AuthContextUtil;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@RequestMapping("/api/logs")
public class SseLogController {

    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        if (!AuthContextUtil.hasAnyPermission("log:read", "admin")) {
            throw new SecurityException("log read permission required");
        }
        SseEmitter emitter = new SseEmitter(0L); // Infinite timeout
        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((e) -> emitters.remove(emitter));

        return emitter;
    }

    public void dispatchLog(String logMessage) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(logMessage));
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }
}
