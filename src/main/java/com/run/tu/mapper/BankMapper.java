package com.run.tu.mapper;

import com.run.tu.core.mapper.Mapper;
import com.run.tu.dto.BankDTO;
import com.run.tu.entity.Bank;

import java.util.List;

/**
 * @author ronger
 */
public interface BankMapper extends Mapper<Bank> {
    /**
     * 查询银行列表数据
     *
     * @return
     */
    List<BankDTO> selectBanks();
}
