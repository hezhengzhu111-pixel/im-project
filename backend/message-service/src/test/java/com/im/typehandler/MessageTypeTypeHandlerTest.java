package com.im.typehandler;

import com.im.enums.MessageType;
import org.apache.ibatis.type.JdbcType;
import org.junit.jupiter.api.Test;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MessageTypeTypeHandlerTest {

    private final MessageTypeTypeHandler handler = new MessageTypeTypeHandler();

    @Test
    void shouldPersistEnumAsIntegerCode() throws Exception {
        PreparedStatement statement = mock(PreparedStatement.class);

        handler.setNonNullParameter(statement, 1, MessageType.TEXT, JdbcType.INTEGER);

        verify(statement).setInt(1, 1);
    }

    @Test
    void shouldReadEnumFromIntegerColumn() throws Exception {
        ResultSet resultSet = mock(ResultSet.class);
        when(resultSet.getInt("message_type")).thenReturn(7);
        when(resultSet.wasNull()).thenReturn(false);

        assertEquals(MessageType.SYSTEM, handler.getNullableResult(resultSet, "message_type"));
    }

    @Test
    void shouldReturnNullWhenDatabaseColumnIsNull() throws Exception {
        CallableStatement statement = mock(CallableStatement.class);
        when(statement.getInt(1)).thenReturn(0);
        when(statement.wasNull()).thenReturn(true);

        assertNull(handler.getNullableResult(statement, 1));
    }
}
