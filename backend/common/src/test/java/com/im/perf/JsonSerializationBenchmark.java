package com.im.perf;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONWriter;
import com.im.dto.MessageDTO;
import com.im.enums.MessageType;

public class JsonSerializationBenchmark {

    public static void main(String[] args) {
        MessageDTO dto = MessageDTO.builder()
                .id(1L)
                .senderId(100L)
                .receiverId(200L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        int warmup = 20_000;
        int iterations = 200_000;

        for (int i = 0; i < warmup; i++) {
            JSON.toJSONString(dto, JSONWriter.Feature.WriteLongAsString);
        }

        long start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            JSON.toJSONString(dto, JSONWriter.Feature.WriteLongAsString);
        }
        long elapsedNs = System.nanoTime() - start;
        double avgNs = (double) elapsedNs / iterations;
        System.out.println("fastjson2 avg ns/op: " + avgNs);
    }
}

