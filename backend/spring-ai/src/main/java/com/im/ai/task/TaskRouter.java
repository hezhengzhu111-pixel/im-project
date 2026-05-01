package com.im.ai.task;

import com.im.ai.handler.AutoReplyHandler;
import com.im.ai.handler.RagParseHandler;
import com.im.ai.handler.RagQueryHandler;
import com.im.ai.handler.SummaryHandler;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class TaskRouter {

    private final SummaryHandler summaryHandler;
    private final AutoReplyHandler autoReplyHandler;
    private final RagParseHandler ragParseHandler;
    private final RagQueryHandler ragQueryHandler;
    private final ExecutorService executor;

    public TaskRouter(SummaryHandler summaryHandler,
                      AutoReplyHandler autoReplyHandler,
                      RagParseHandler ragParseHandler,
                      RagQueryHandler ragQueryHandler) {
        this.summaryHandler = summaryHandler;
        this.autoReplyHandler = autoReplyHandler;
        this.ragParseHandler = ragParseHandler;
        this.ragQueryHandler = ragQueryHandler;
        this.executor = Executors.newFixedThreadPool(4);
    }

    public void handleSummary(Map<String, String> fields) {
        executor.submit(() -> summaryHandler.handle(fields));
    }

    public void handleAutoReply(Map<String, String> fields) {
        executor.submit(() -> autoReplyHandler.handle(fields));
    }

    public void handleRagParse(Map<String, String> fields) {
        executor.submit(() -> ragParseHandler.handle(fields));
    }

    public void handleRagQuery(Map<String, String> fields) {
        executor.submit(() -> ragQueryHandler.handle(fields));
    }
}
