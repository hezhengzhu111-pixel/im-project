package com.im.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.entity.GroupReadCursor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class GroupReadCursorMapperTest {

    @Autowired
    private GroupReadCursorMapper mapper;

    @Test
    void saveAndFindByGroupIdAndUserId() {
        GroupReadCursor cursor = new GroupReadCursor();
        cursor.setGroupId(1L);
        cursor.setUserId(2L);
        cursor.setLastReadAt(LocalDateTime.now().minusMinutes(1));
        mapper.insert(cursor);

        GroupReadCursor loaded = mapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                .eq(GroupReadCursor::getGroupId, 1L)
                .eq(GroupReadCursor::getUserId, 2L)
                .last("limit 1"));
        assertThat(loaded).isNotNull();
        assertThat(loaded.getGroupId()).isEqualTo(1L);
        assertThat(loaded.getUserId()).isEqualTo(2L);
        assertThat(loaded.getLastReadAt()).isNotNull();
    }
}

