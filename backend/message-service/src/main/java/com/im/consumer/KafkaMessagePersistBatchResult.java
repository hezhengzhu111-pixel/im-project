package com.im.consumer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class KafkaMessagePersistBatchResult {

    private final int recordCount;
    private final int messageCount;
    private final List<Detail> successDetails;
    private final List<Detail> duplicateDetails;
    private final List<Detail> poisonDetails;
    private final List<Detail> retryableDetails;

    private KafkaMessagePersistBatchResult(int recordCount,
                                           int messageCount,
                                           List<Detail> successDetails,
                                           List<Detail> duplicateDetails,
                                           List<Detail> poisonDetails,
                                           List<Detail> retryableDetails) {
        this.recordCount = recordCount;
        this.messageCount = messageCount;
        this.successDetails = List.copyOf(successDetails);
        this.duplicateDetails = List.copyOf(duplicateDetails);
        this.poisonDetails = List.copyOf(poisonDetails);
        this.retryableDetails = List.copyOf(retryableDetails);
    }

    int getRecordCount() {
        return recordCount;
    }

    int getMessageCount() {
        return messageCount;
    }

    int getSuccessCount() {
        return successDetails.size();
    }

    int getDuplicateCount() {
        return duplicateDetails.size();
    }

    int getPoisonCount() {
        return poisonDetails.size();
    }

    int getRetryableCount() {
        return retryableDetails.size();
    }

    List<Detail> getSuccessDetails() {
        return Collections.unmodifiableList(successDetails);
    }

    List<Detail> getDuplicateDetails() {
        return Collections.unmodifiableList(duplicateDetails);
    }

    List<Detail> getPoisonDetails() {
        return Collections.unmodifiableList(poisonDetails);
    }

    List<Detail> getRetryableDetails() {
        return Collections.unmodifiableList(retryableDetails);
    }

    boolean hasRetryableFailures() {
        return !retryableDetails.isEmpty();
    }

    String summary() {
        return "recordCount=" + recordCount
                + ", messageCount=" + messageCount
                + ", successCount=" + getSuccessCount()
                + ", duplicateCount=" + getDuplicateCount()
                + ", poisonCount=" + getPoisonCount()
                + ", retryableCount=" + getRetryableCount()
                + ", duplicateDetails=" + duplicateDetails
                + ", poisonDetails=" + poisonDetails
                + ", retryableDetails=" + retryableDetails;
    }

    static Builder builder(int recordCount) {
        return new Builder(recordCount);
    }

    record Detail(int partition,
                  long offset,
                  Long messageId,
                  String clientMessageId,
                  String conversationId,
                  String reason) {
    }

    static final class Builder {
        private final int recordCount;
        private int messageCount;
        private final List<Detail> successDetails = new ArrayList<>();
        private final List<Detail> duplicateDetails = new ArrayList<>();
        private final List<Detail> poisonDetails = new ArrayList<>();
        private final List<Detail> retryableDetails = new ArrayList<>();

        private Builder(int recordCount) {
            this.recordCount = recordCount;
        }

        void incrementMessageCount() {
            messageCount++;
        }

        void addSuccess(Detail detail) {
            successDetails.add(detail);
        }

        void addDuplicate(Detail detail) {
            duplicateDetails.add(detail);
        }

        void addPoison(Detail detail) {
            poisonDetails.add(detail);
        }

        void addRetryable(Detail detail) {
            retryableDetails.add(detail);
        }

        KafkaMessagePersistBatchResult build() {
            return new KafkaMessagePersistBatchResult(
                    recordCount,
                    messageCount,
                    successDetails,
                    duplicateDetails,
                    poisonDetails,
                    retryableDetails
            );
        }
    }
}
