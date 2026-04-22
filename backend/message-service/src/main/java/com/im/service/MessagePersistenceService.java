package com.im.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.im.message.entity.Message;

import java.util.ArrayList;
import java.util.List;

public interface MessagePersistenceService extends IService<Message> {

    BatchPersistResult persistIdempotentBatch(List<Message> messages);

    enum PersistDisposition {
        INSERTED,
        DUPLICATE
    }

    record BatchPersistResult(List<PersistDisposition> dispositions) {

        public BatchPersistResult {
            dispositions = List.copyOf(dispositions);
        }

        public static BatchPersistResult empty() {
            return new BatchPersistResult(List.of());
        }

        public static BatchPersistResult inserted(int size) {
            List<PersistDisposition> dispositions = new ArrayList<>(size);
            for (int i = 0; i < size; i++) {
                dispositions.add(PersistDisposition.INSERTED);
            }
            return new BatchPersistResult(dispositions);
        }

        public int size() {
            return dispositions.size();
        }

        public PersistDisposition dispositionAt(int index) {
            return dispositions.get(index);
        }
    }
}
