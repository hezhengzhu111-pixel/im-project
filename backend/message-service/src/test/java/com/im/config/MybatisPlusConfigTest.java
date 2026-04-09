package com.im.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.im.message.entity.Message;
import com.im.persistence.entity.BaseEntity;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.reflection.SystemMetaObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MybatisPlusConfigTest {

    private final MetaObjectHandler metaObjectHandler = new MybatisPlusConfig().metaObjectHandler();

    @Test
    void insertFillPopulatesBaseEntityTimestamps() {
        Message message = new Message();
        initTableInfo(Message.class);

        assertTrue(message instanceof BaseEntity);

        MetaObject metaObject = SystemMetaObject.forObject(message);
        metaObjectHandler.insertFill(metaObject);

        assertNotNull(message.getCreatedTime());
        assertNotNull(message.getUpdatedTime());
    }

    @Test
    void updateFillPopulatesUpdatedTime() {
        Message message = new Message();
        initTableInfo(Message.class);

        MetaObject metaObject = SystemMetaObject.forObject(message);
        metaObjectHandler.updateFill(metaObject);

        assertNotNull(message.getUpdatedTime());
    }

    private void initTableInfo(Class<?> entityClass) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityClass.getName());
        TableInfoHelper.initTableInfo(assistant, entityClass);
    }
}
