package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.entity.Permission;
import org.zhitui.tu.entity.User;

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
