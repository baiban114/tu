package com.run.tu.mapper;

import com.run.tu.core.mapper.Mapper;
import com.run.tu.entity.LoginRecord;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Created on 2022/1/14 8:46.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName com.run.tu.mapper
 */
public interface LoginRecordMapper extends Mapper<LoginRecord> {
    /**
     * 获取用户登录记录
     *
     * @param idUser
     * @return
     */
    List<LoginRecord> selectLoginRecordByIdUser(@Param("idUser") Integer idUser);
}
