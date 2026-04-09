package com.im.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.im.group.entity.Group;
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
        Group group = new Group();
        initTableInfo(Group.class);

        assertTrue(group instanceof BaseEntity);

        MetaObject metaObject = SystemMetaObject.forObject(group);
        metaObjectHandler.insertFill(metaObject);

        assertNotNull(group.getCreatedTime());
        assertNotNull(group.getUpdatedTime());
    }

    @Test
    void updateFillPopulatesUpdatedTime() {
        Group group = new Group();
        initTableInfo(Group.class);

        MetaObject metaObject = SystemMetaObject.forObject(group);
        metaObjectHandler.updateFill(metaObject);

        assertNotNull(group.getUpdatedTime());
    }

    private void initTableInfo(Class<?> entityClass) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityClass.getName());
        TableInfoHelper.initTableInfo(assistant, entityClass);
    }
}
