package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.dto.BankDTO;
import org.zhitui.tu.entity.Bank;

import java.util.List;

/**
 * 银行
 *
 * @author ronger
 */
public interface BankService extends Service<Bank> {
    List<BankDTO> findBanks();
}
