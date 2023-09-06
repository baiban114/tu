package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.dto.BankDTO;
import org.zhitui.tu.entity.Bank;

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
