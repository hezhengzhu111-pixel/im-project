package com.im.enums;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MessageTypeContractTest {

    @Test
    void shouldUseUniqueDatabaseCodesForEveryMessageType() {
        Set<Integer> codes = Arrays.stream(MessageType.values())
                .map(MessageType::getCode)
                .collect(Collectors.toSet());

        assertEquals(MessageType.values().length, codes.size());
        assertEquals(7, MessageType.SYSTEM.getCode());
        assertEquals(MessageType.TEXT, MessageType.fromCode(1));
        assertEquals(MessageType.SYSTEM, MessageType.fromCode(7));
    }
}
