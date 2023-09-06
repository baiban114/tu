package org.zhitui.tu.service.impl;

import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.dto.BankDTO;
import org.zhitui.tu.entity.Bank;
import org.zhitui.tu.mapper.BankMapper;
import org.zhitui.tu.service.BankService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

/**
 * 银行
 *
 * @author ronger
 */
@Service
public class BankServiceImpl extends AbstractService<Bank> implements BankService {

    @Resource
    private BankMapper bankMapper;

    @Override
    public List<BankDTO> findBanks() {
        List<BankDTO> banks = bankMapper.selectBanks();
        return banks;
    }
}
