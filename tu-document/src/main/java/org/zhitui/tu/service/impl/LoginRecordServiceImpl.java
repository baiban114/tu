package org.zhitui.tu.service.impl;

import cn.hutool.http.useragent.UserAgent;
import cn.hutool.http.useragent.UserAgentUtil;
import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.entity.LoginRecord;
import org.zhitui.tu.mapper.LoginRecordMapper;
import org.zhitui.tu.service.LoginRecordService;
import org.zhitui.tu.util.Utils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.Date;
import java.util.List;
import java.util.Objects;

/**
 * Created on 2022/1/14 8:48.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 * @packageName org.zhitui.tu.service.impl
 */
@Service
public class LoginRecordServiceImpl extends AbstractService<LoginRecord> implements LoginRecordService {

    @Resource
    private LoginRecordMapper loginRecordMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public LoginRecord saveLoginRecord(Long idUser) {
        HttpServletRequest request = ((ServletRequestAttributes) Objects.requireNonNull(RequestContextHolder.getRequestAttributes())).getRequest();
        String ip = Utils.getIpAddress(request);
        String ua = request.getHeader("user-agent");
        String fingerprint = request.getHeader("fingerprint");
        LoginRecord loginRecord = new LoginRecord();
        loginRecord.setIdUser(idUser);
        loginRecord.setLoginIp(ip);
        loginRecord.setLoginUa(ua);
        loginRecord.setLoginDeviceId(fingerprint);
        UserAgent userAgent = UserAgentUtil.parse(ua);
        loginRecord.setLoginOS(userAgent.getOs().toString());
        loginRecord.setLoginBrowser(userAgent.getBrowser().toString());
        loginRecord.setCreatedTime(new Date());
        loginRecordMapper.insertSelective(loginRecord);
        return loginRecord;
    }

    @Override
    public List<LoginRecord> findLoginRecordByIdUser(Integer idUser) {
        return loginRecordMapper.selectLoginRecordByIdUser(idUser);
    }
}
