package com.run.tu.service;

import com.run.tu.core.service.Service;
import com.run.tu.dto.BankDTO;
import com.run.tu.entity.Bank;

import java.util.List;

/**
 * 银行
 *
 * @author ronger
 */
public interface BankService extends Service<Bank> {
    List<BankDTO> findBanks();
}
