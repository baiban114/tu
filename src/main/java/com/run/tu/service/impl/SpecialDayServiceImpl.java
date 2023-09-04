package com.run.tu.service.impl;

import com.run.tu.core.service.AbstractService;
import com.run.tu.entity.SpecialDay;
import com.run.tu.mapper.SpecialDayMapper;
import com.run.tu.service.SpecialDayService;
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
