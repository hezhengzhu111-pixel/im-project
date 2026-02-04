package com.im.mapper;

import com.im.entity.MessageOutboxEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class MessageOutboxMapperTest {

    @Autowired
    private MessageOutboxMapper mapper;

    @Test
    void findDueEventsOnlyReturnsPendingOrFailedAndDue() {
        LocalDateTime now = LocalDateTime.now();

        MessageOutboxEvent duePending = new MessageOutboxEvent();
        duePending.setTopic("t");
        duePending.setMessageKey("k");
        duePending.setPayload("{\"x\":1}");
        duePending.setStatus("PENDING");
        duePending.setAttempts(0);
        duePending.setNextRetryAt(now.minusSeconds(1));
        mapper.insert(duePending);

        MessageOutboxEvent futurePending = new MessageOutboxEvent();
        futurePending.setTopic("t");
        futurePending.setMessageKey("k2");
        futurePending.setPayload("{\"x\":2}");
        futurePending.setStatus("PENDING");
        futurePending.setAttempts(0);
        futurePending.setNextRetryAt(now.plusMinutes(5));
        mapper.insert(futurePending);

        MessageOutboxEvent sent = new MessageOutboxEvent();
        sent.setTopic("t");
        sent.setMessageKey("k3");
        sent.setPayload("{\"x\":3}");
        sent.setStatus("SENT");
        sent.setAttempts(1);
        sent.setNextRetryAt(now.minusSeconds(1));
        mapper.insert(sent);

        List<MessageOutboxEvent> due = mapper.selectDueEvents(now, 10);
        assertThat(due).extracting(MessageOutboxEvent::getStatus).allMatch(s -> s.equals("PENDING") || s.equals("FAILED"));
        assertThat(due).extracting(MessageOutboxEvent::getMessageKey).contains("k").doesNotContain("k2", "k3");
    }
}

