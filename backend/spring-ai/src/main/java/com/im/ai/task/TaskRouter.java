package com.im.ai.task;

import com.im.ai.handler.AutoReplyHandler;
import com.im.ai.handler.RagParseHandler;
import com.im.ai.handler.RagQueryHandler;
import com.im.ai.handler.SummaryHandler;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TaskRouter {

    private final SummaryHandler summaryHandler;
    private final AutoReplyHandler autoReplyHandler;
    private final RagParseHandler ragParseHandler;
    private final RagQueryHandler ragQueryHandler;

    public TaskRouter(SummaryHandler summaryHandler,
                      AutoReplyHandler autoReplyHandler,
                      RagParseHandler ragParseHandler,
                      RagQueryHandler ragQueryHandler) {
        this.summaryHandler = summaryHandler;
        this.autoReplyHandler = autoReplyHandler;
        this.ragParseHandler = ragParseHandler;
        this.ragQueryHandler = ragQueryHandler;
    }

    public void handleSummary(Map<String, String> fields) {
        startVirtualThread(() -> summaryHandler.handle(fields),
                "summary-" + fields.getOrDefault("taskId", "?"));
    }

    public void handleAutoReply(Map<String, String> fields) {
        startVirtualThread(() -> autoReplyHandler.handle(fields),
                "reply-" + fields.getOrDefault("taskId", "?"));
    }

    public void handleRagParse(Map<String, String> fields) {
        startVirtualThread(() -> ragParseHandler.handle(fields),
                "parse-" + fields.getOrDefault("docId", "?"));
    }

    public void handleRagQuery(Map<String, String> fields) {
        startVirtualThread(() -> ragQueryHandler.handle(fields),
                "ragq-" + fields.getOrDefault("taskId", "?"));
    }

    private void startVirtualThread(Runnable task, String name) {
        Thread.ofVirtual()
                .name(name)
                .uncaughtExceptionHandler((t, ex) ->
                        System.err.println("[VT][" + t.getName() + "] unhandled: " + ex.getMessage()))
                .start(task);
    }
}
