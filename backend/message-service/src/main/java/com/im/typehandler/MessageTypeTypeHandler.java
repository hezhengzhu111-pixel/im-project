package com.im.typehandler;

import com.im.enums.MessageType;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class MessageTypeTypeHandler extends BaseTypeHandler<MessageType> {

    @Override
    public void setNonNullParameter(
            PreparedStatement ps,
            int i,
            MessageType parameter,
            JdbcType jdbcType
    ) throws SQLException {
        ps.setInt(i, parameter.getCode());
    }

    @Override
    public MessageType getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toMessageType(rs.getInt(columnName), rs.wasNull());
    }

    @Override
    public MessageType getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toMessageType(rs.getInt(columnIndex), rs.wasNull());
    }

    @Override
    public MessageType getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toMessageType(cs.getInt(columnIndex), cs.wasNull());
    }

    private MessageType toMessageType(int code, boolean wasNull) {
        if (wasNull) {
            return null;
        }
        return MessageType.fromCode(code);
    }
}
