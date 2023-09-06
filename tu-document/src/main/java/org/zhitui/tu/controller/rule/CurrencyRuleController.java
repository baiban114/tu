package org.zhitui.tu.controller.rule;

import org.zhitui.tu.core.result.GlobalResult;
import org.zhitui.tu.core.result.GlobalResultGenerator;
import org.zhitui.tu.entity.CurrencyRule;
import org.zhitui.tu.service.CurrencyRuleService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.util.List;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/rule/currency")
public class CurrencyRuleController {

    @Resource
    private CurrencyRuleService currencyRuleService;

    @GetMapping("/list")
    public GlobalResult list() {
        List<CurrencyRule> list = currencyRuleService.findAll();
        return GlobalResultGenerator.genSuccessResult(list);
    }

}
