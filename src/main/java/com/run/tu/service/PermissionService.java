package com.run.tu.service;

import com.run.tu.core.service.Service;
import com.run.tu.entity.Permission;
import com.run.tu.entity.User;

import java.util.List;


/**
 * @author CodeGenerator
 * @date 2018/05/29
 */
public interface PermissionService extends Service<Permission> {

    /**
     * 获取用户权限
     *
     * @param sysUser
     * @return
     */
    List<Permission> selectPermissionByUser(User sysUser);
}
