package com.im.ai.task;

public enum TaskType {
    SUMMARY("summary"),
    AUTO_REPLY("auto_reply"),
    RAG_PARSE("rag_parse"),
    RAG_QUERY("rag_query");

    private final String value;

    TaskType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static TaskType fromValue(String value) {
        for (TaskType t : values()) {
            if (t.value.equals(value)) {
                return t;
            }
        }
        throw new IllegalArgumentException("Unknown task type: " + value);
    }
}
