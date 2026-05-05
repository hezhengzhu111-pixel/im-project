package com.im.ai.task;

import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TaskConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private final TaskRouter router;

    public TaskConsumer(TaskRouter router) {
        this.router = router;
    }

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        try {
            Map<String, String> body = message.getValue();
            String taskType = body.getOrDefault("taskType", "");
            switch (TaskType.fromValue(taskType)) {
                case SUMMARY -> router.handleSummary(body);
                case AUTO_REPLY -> router.handleAutoReply(body);
                case RAG_PARSE -> router.handleRagParse(body);
                case RAG_QUERY -> router.handleRagQuery(body);
            }
        } catch (IllegalArgumentException e) {
            System.err.println("Unknown task type, skipping: " + e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
