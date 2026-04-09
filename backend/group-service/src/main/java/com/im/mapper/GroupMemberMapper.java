package com.im.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.im.group.entity.GroupMember;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface GroupMemberMapper extends BaseMapper<GroupMember> {

    @Select("""
            SELECT CASE WHEN COUNT(1) > 0 THEN TRUE ELSE FALSE END
            FROM im_group_member
            WHERE group_id = #{groupId}
              AND user_id = #{userId}
              AND status = 1
            """)
    boolean existsActiveMember(@Param("groupId") Long groupId, @Param("userId") Long userId);

    @Select("""
            SELECT * FROM im_group_member
            WHERE group_id = #{groupId}
              AND status = 1
            """)
    List<GroupMember> selectMembersByGroupId(@Param("groupId") Long groupId);
}

