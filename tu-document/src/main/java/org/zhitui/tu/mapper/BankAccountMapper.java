package org.zhitui.tu.mapper;

import org.zhitui.tu.core.mapper.Mapper;
import org.zhitui.tu.dto.BankAccountDTO;
import org.zhitui.tu.entity.BankAccount;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * @author ronger
 */
public interface BankAccountMapper extends Mapper<BankAccount> {
    /**
     * 查询银行账户
     *
     * @param bankName
     * @param accountOwnerName
     * @param bankAccount
     * @return
     */
    List<BankAccountDTO> selectBankAccounts(@Param("bankName") String bankName, @Param("accountOwnerName") String accountOwnerName, @Param("bankAccount") String bankAccount);

    /**
     * 获取银行账户信息
     *
     * @param idBank
     * @return
     */
    BankAccountDTO selectBankAccount(@Param("idBank") Long idBank);

    /**
     * 获取当前最大卡号
     *
     * @return
     */
    String selectMaxBankAccount();

    /**
     * 根据卡号获取银行账号信息
     *
     * @param bankAccount
     * @return
     */
    BankAccountDTO selectByBankAccount(@Param("bankAccount") String bankAccount);

    /**
     * 查询用户个人银行账户信息
     *
     * @param idUser
     * @return
     */
    BankAccountDTO findPersonBankAccountByIdUser(@Param("idUser") Long idUser);
}