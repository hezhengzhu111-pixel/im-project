package com.im.log.consumer;

import com.im.log.controller.SseLogController;
import com.im.log.entity.LogDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class KafkaLogConsumer {

    private static final Logger log = LoggerFactory.getLogger(KafkaLogConsumer.class);
    private final SseLogController sseLogController;
    private final ElasticsearchOperations elasticsearchOperations;
    
    private final List<LogDocument> batch = new ArrayList<>();
    private static final int BATCH_SIZE = 500;

    // e.g. 2026-03-23 20:50:00.000 [thread] INFO  [traceId=xxx] logger - message
    private static final Pattern LOG_PATTERN = Pattern.compile(
            "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3}\\s+\\[.*?\\]\\s+(\\w+)\\s+\\[traceId=(.*?)\\]\\s+(.*?)\\s+-\\s+(.*)$"
    );

    public KafkaLogConsumer(SseLogController sseLogController, ElasticsearchOperations elasticsearchOperations) {
        this.sseLogController = sseLogController;
        this.elasticsearchOperations = elasticsearchOperations;
    }

    @KafkaListener(topics = "im-service-logs", groupId = "log-service-group")
    public void consume(String message) {
        // 1. Dispatch to SSE
        sseLogController.dispatchLog(message);

        // 2. Parse and save to ES
        LogDocument doc = parseLog(message);
        if (doc != null) {
            synchronized (batch) {
                batch.add(doc);
                if (batch.size() >= BATCH_SIZE) {
                    elasticsearchOperations.save(batch);
                    batch.clear();
                }
            }
        }
    }

    private LogDocument parseLog(String message) {
        Matcher matcher = LOG_PATTERN.matcher(message);
        if (matcher.find()) {
            LogDocument doc = new LogDocument();
            doc.setId(UUID.randomUUID().toString());
            doc.setLevel(matcher.group(1));
            String traceId = matcher.group(2);
            doc.setTraceId(traceId.isEmpty() ? null : traceId);
            doc.setServiceName(matcher.group(3)); // roughly
            doc.setMessage(matcher.group(4));
            doc.setTimestamp(System.currentTimeMillis());
            return doc;
        }
        return null;
    }

    @Scheduled(fixedDelay = 5000)
    public void flushBatch() {
        synchronized (batch) {
            if (!batch.isEmpty()) {
                elasticsearchOperations.save(batch);
                batch.clear();
            }
        }
    }
}
