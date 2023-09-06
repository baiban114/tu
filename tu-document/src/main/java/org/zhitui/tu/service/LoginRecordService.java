package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.entity.LoginRecord;

import java.util.List;

/**
 * Created on 2022/1/14 8:47.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.service
 */
public interface LoginRecordService extends Service<LoginRecord> {
    /**
     * 保存登录记录
     *
     * @param idUser
     * @return
     */
    LoginRecord saveLoginRecord(Long idUser);

    /**
     * 获取用户登录记录
     *
     * @param idUser
     * @return
     */
    List<LoginRecord> findLoginRecordByIdUser(Integer idUser);
}
