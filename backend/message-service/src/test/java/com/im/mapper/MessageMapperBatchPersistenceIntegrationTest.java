package com.im.mapper;

import com.im.enums.MessageType;
import com.im.message.entity.Message;
import com.im.typehandler.MessageTypeTypeHandler;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class MessageMapperBatchPersistenceIntegrationTest {

    private JdbcDataSource dataSource;
    private SqlSessionFactory sqlSessionFactory;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:msg_batch_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");
        dataSource.setPassword("");
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE messages (
                      id BIGINT NOT NULL PRIMARY KEY,
                      sender_id BIGINT NOT NULL,
                      receiver_id BIGINT NULL,
                      group_id BIGINT NULL,
                      client_message_id VARCHAR(64) NULL,
                      message_type INT NOT NULL,
                      content VARCHAR(2048) NULL,
                      media_url VARCHAR(500) NULL,
                      media_size BIGINT NULL,
                      media_name VARCHAR(255) NULL,
                      thumbnail_url VARCHAR(500) NULL,
                      duration INT NULL,
                      location_info VARCHAR(2048) NULL,
                      status INT NOT NULL,
                      is_group_chat TINYINT NOT NULL DEFAULT 0,
                      reply_to_message_id BIGINT NULL,
                      created_time TIMESTAMP NOT NULL,
                      updated_time TIMESTAMP NOT NULL,
                      CONSTRAINT uk_messages_sender_client_message UNIQUE (sender_id, client_message_id)
                    )
                    """);
        }

        org.apache.ibatis.session.Configuration configuration =
                new org.apache.ibatis.session.Configuration(new Environment(
                        "test",
                        new JdbcTransactionFactory(),
                        dataSource
                ));
        configuration.getTypeHandlerRegistry().register(MessageTypeTypeHandler.class);
        configuration.addMapper(MessageMapper.class);
        sqlSessionFactory = new SqlSessionFactoryBuilder().build(configuration);
    }

    @Test
    void batchUpsertIdempotentShouldInsertNewRowsAndKeepDuplicateRowsOutOfTable() throws Exception {
        insertExistingMessage(9001L, 1L, "client-existing", "existing");

        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            MessageMapper mapper = session.getMapper(MessageMapper.class);
            mapper.batchUpsertIdempotent(List.of(
                    message(9101L, 1L, 2L, "client-existing", "duplicate"),
                    message(9102L, 1L, 2L, "client-new", "fresh")
            ));
        }

        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             java.sql.ResultSet rs = statement.executeQuery("SELECT COUNT(1) FROM messages")) {
            assertTrue(rs.next());
            assertEquals(2, rs.getInt(1));
        }

        try (SqlSession session = sqlSessionFactory.openSession()) {
            MessageMapper mapper = session.getMapper(MessageMapper.class);
            assertEquals(List.of(9001L, 9102L), mapper.selectExistingMessageIds(List.of(9001L, 9102L)));
            List<MessageMapper.SenderClientKey> keys = mapper.selectExistingSenderClientKeys(List.of(
                    new MessageMapper.SenderClientKey(1L, "client-existing"),
                    new MessageMapper.SenderClientKey(1L, "client-new")
            ));
            assertEquals(2, keys.size());
        }
    }

    @Test
    void batchUpsertIdempotentShouldFailOnTrueBadRecord() {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            MessageMapper mapper = session.getMapper(MessageMapper.class);
            assertThrows(Exception.class, () -> mapper.batchUpsertIdempotent(List.of(
                    message(9201L, 1L, 2L, "client-ok", "ok"),
                    message(9202L, null, 2L, "client-bad", "bad")
            )));
        }
    }

    private void insertExistingMessage(Long id,
                                       Long senderId,
                                       String clientMessageId,
                                       String content) throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO messages " +
                    "(id, sender_id, receiver_id, group_id, client_message_id, message_type, content, media_url, media_size, media_name, thumbnail_url, duration, location_info, status, is_group_chat, reply_to_message_id, created_time, updated_time) VALUES " +
                    "(" + id + ", " + senderId + ", 2, NULL, '" + clientMessageId + "', 1, '" + content + "', NULL, NULL, NULL, NULL, NULL, NULL, 1, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        }
    }

    private Message message(Long id,
                            Long senderId,
                            Long receiverId,
                            String clientMessageId,
                            String content) {
        Message message = new Message();
        message.setId(id);
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setClientMessageId(clientMessageId);
        message.setMessageType(MessageType.TEXT);
        message.setContent(content);
        message.setStatus(Message.MessageStatus.SENT);
        message.setIsGroupChat(false);
        message.setCreatedTime(LocalDateTime.of(2026, 4, 17, 10, 0));
        message.setUpdatedTime(LocalDateTime.of(2026, 4, 17, 10, 0));
        return message;
    }
}
