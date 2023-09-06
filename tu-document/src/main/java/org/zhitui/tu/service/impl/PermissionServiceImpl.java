package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.entity.Permission;
import org.zhitui.tu.entity.Role;
import org.zhitui.tu.entity.User;
import org.zhitui.tu.mapper.PermissionMapper;
import org.zhitui.tu.service.PermissionService;
import org.zhitui.tu.service.RoleService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;


/**
 * @author CodeGenerator
 * @date 2018/05/29
 */
@Service
public class PermissionServiceImpl extends AbstractService<Permission> implements PermissionService {
    @Resource
    private PermissionMapper permissionMapper;

    @Resource
    private RoleService roleService;

    @Override
    public List<Permission> selectPermissionByUser(User sysUser) {
        List<Permission> list = new ArrayList<Permission>();
        List<Role> roles = roleService.selectRoleByUser(sysUser);
        roles.forEach(role -> list.addAll(permissionMapper.selectMenuByIdRole(role.getIdRole())));
        HashSet hashSet = new HashSet(list);
        list.clear();
        list.addAll(hashSet);
        return list;
    }
}
