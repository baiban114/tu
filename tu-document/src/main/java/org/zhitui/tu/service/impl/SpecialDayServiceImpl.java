package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.entity.SpecialDay;
import org.zhitui.tu.mapper.SpecialDayMapper;
import org.zhitui.tu.service.SpecialDayService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

/**
 * @author ronger
 */
@Service
public class SpecialDayServiceImpl extends AbstractService<SpecialDay> implements SpecialDayService {

    @Resource
    private SpecialDayMapper specialDayMapper;

}
