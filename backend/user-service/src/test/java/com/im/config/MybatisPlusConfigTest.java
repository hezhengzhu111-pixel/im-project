package com.im.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.im.persistence.entity.BaseEntity;
import com.im.user.entity.User;
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
        User user = new User();
        initTableInfo(User.class);

        assertTrue(user instanceof BaseEntity);

        MetaObject metaObject = SystemMetaObject.forObject(user);
        metaObjectHandler.insertFill(metaObject);

        assertNotNull(user.getCreatedTime());
        assertNotNull(user.getUpdatedTime());
    }

    @Test
    void updateFillPopulatesUpdatedTime() {
        User user = new User();
        initTableInfo(User.class);

        MetaObject metaObject = SystemMetaObject.forObject(user);
        metaObjectHandler.updateFill(metaObject);

        assertNotNull(user.getUpdatedTime());
    }

    private void initTableInfo(Class<?> entityClass) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityClass.getName());
        TableInfoHelper.initTableInfo(assistant, entityClass);
    }
}
