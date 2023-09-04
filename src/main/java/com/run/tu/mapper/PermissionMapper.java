package com.run.tu.mapper;

import com.run.tu.core.mapper.Mapper;
import com.run.tu.entity.Permission;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface PermissionMapper extends Mapper<Permission> {

    List<Permission> selectMenuByIdRole(@Param("role") Long role);
}