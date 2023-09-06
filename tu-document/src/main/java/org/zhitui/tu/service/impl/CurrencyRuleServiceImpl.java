package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.entity.CurrencyRule;
import org.zhitui.tu.mapper.CurrencyRuleMapper;
import org.zhitui.tu.service.CurrencyRuleService;
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
