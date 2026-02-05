package com.im.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    @GetMapping("/hello")
    public Map<String, Object> hello() {
        return Map.of("message", "Hello from TestController!");
    }

    @PostMapping("/login")
    public Map<String, Object> testLogin() {
        return Map.of("message", "Test login works!");
    }
}
