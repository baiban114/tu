package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.entity.Permission;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface PermissionMapper extends Mapper<Permission> {

    List<Permission> selectMenuByIdRole(@Param("role") Long role);
}