package com.run.tu.service.impl;

import com.run.tu.core.service.AbstractService;
import com.run.tu.dto.BankDTO;
import com.run.tu.entity.Bank;
import com.run.tu.mapper.BankMapper;
import com.run.tu.service.BankService;
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
