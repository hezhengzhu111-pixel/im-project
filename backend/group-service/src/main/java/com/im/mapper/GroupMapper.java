package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.entity.Group;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface GroupMapper extends BaseMapper<Group> {

    @Select("""
            SELECT g.* FROM im_group g
            JOIN im_group_member gm ON g.id = gm.group_id
            WHERE gm.user_id = #{userId}
              AND gm.status = 1
              AND g.status = 1
            """)
    List<Group> selectGroupsByUserId(@Param("userId") Long userId);
}

