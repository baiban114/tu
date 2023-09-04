package com.run.tu.service.impl;

import com.run.tu.core.service.AbstractService;
import com.run.tu.entity.CurrencyRule;
import com.run.tu.mapper.CurrencyRuleMapper;
import com.run.tu.service.CurrencyRuleService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

/**
 * @author ronger
 */
@Service
public class CurrencyRuleServiceImpl extends AbstractService<CurrencyRule> implements CurrencyRuleService {

    @Resource
    private CurrencyRuleMapper currencyRuleMapper;

}
