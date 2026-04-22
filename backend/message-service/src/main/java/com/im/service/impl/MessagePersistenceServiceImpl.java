package com.im.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class MessagePersistenceServiceImpl extends ServiceImpl<MessageMapper, Message>
        implements MessagePersistenceService {

    @Override
    public BatchPersistResult persistIdempotentBatch(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return BatchPersistResult.empty();
        }

        List<Message> batch = List.copyOf(messages);
        Set<Long> existingIds = loadExistingIds(batch);
        Set<MessageMapper.SenderClientKey> existingSenderClientKeys = loadExistingSenderClientKeys(batch);

        baseMapper.batchUpsertIdempotent(batch);

        List<PersistDisposition> dispositions = new ArrayList<>(batch.size());
        Set<Long> seenIds = new HashSet<>();
        Set<MessageMapper.SenderClientKey> seenSenderClientKeys = new HashSet<>();
        for (Message message : batch) {
            Long messageId = message == null ? null : message.getId();
            MessageMapper.SenderClientKey senderClientKey = toSenderClientKey(message);
            boolean duplicate = messageId != null && existingIds.contains(messageId);
            if (senderClientKey != null && existingSenderClientKeys.contains(senderClientKey)) {
                duplicate = true;
            }
            if (messageId != null && !seenIds.add(messageId)) {
                duplicate = true;
            }
            if (senderClientKey != null && !seenSenderClientKeys.add(senderClientKey)) {
                duplicate = true;
            }
            dispositions.add(duplicate ? PersistDisposition.DUPLICATE : PersistDisposition.INSERTED);
        }
        return new BatchPersistResult(dispositions);
    }

    private Set<Long> loadExistingIds(List<Message> batch) {
        List<Long> ids = batch.stream()
                .map(Message::getId)
                .filter(id -> id != null)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(baseMapper.selectExistingMessageIds(ids));
    }

    private Set<MessageMapper.SenderClientKey> loadExistingSenderClientKeys(List<Message> batch) {
        List<MessageMapper.SenderClientKey> keys = batch.stream()
                .map(this::toSenderClientKey)
                .filter(key -> key != null)
                .distinct()
                .toList();
        if (keys.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(baseMapper.selectExistingSenderClientKeys(keys));
    }

    private MessageMapper.SenderClientKey toSenderClientKey(Message message) {
        if (message == null || message.getSenderId() == null || !StringUtils.hasText(message.getClientMessageId())) {
            return null;
        }
        return new MessageMapper.SenderClientKey(message.getSenderId(), message.getClientMessageId().trim());
    }
}
