package org.zhitui.tu.service;

import org.zhitui.tu.base.BaseServiceTest;
import org.zhitui.tu.dto.BankAccountDTO;
import org.zhitui.tu.dto.BankAccountSearchDTO;
import org.zhitui.tu.dto.TransactionRecordDTO;
import org.zhitui.tu.entity.BankAccount;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class BankAccountServiceTest extends BaseServiceTest {

    /**
     * 待查询银行账户列表
     */
    private final BankAccountSearchDTO bankAccountSearchDTO;
    private final Long idUser = 65001L;

    @Autowired
    private ArticleThumbsUpService articleThumbsUpService;
    @Autowired
    private BankAccountService bankAccountService;

    {
        bankAccountSearchDTO = new BankAccountSearchDTO();

    }

    @Test
    @BeforeEach
    @DisplayName("创建钱包账号")
    public void createBankAccount() {

        BankAccount bankAccount = bankAccountService.createBankAccount(idUser);
        assertEquals(idUser, bankAccount.getAccountOwner());
    }

//    @Test
//    @DisplayName("测试查询银行账户列表")
//    public void findBankAccounts() {
//        List<BankAccountDTO> bankAccounts = bankAccountService.findBankAccounts(bankAccountSearchDTO);
//        assertEquals(3, bankAccounts.size());
//    }

//    @Test
//    @DisplayName("测试查询银行账户")
//    public void findBankAccountByIdUser() {
//        BankAccountDTO bankAccountByIdUser = bankAccountService.findBankAccountByIdUser(idUser);
//        assertEquals(idUser.intValue(), bankAccountByIdUser.getAccountOwner());
//
//
//    }

    @Test
    @DisplayName("根据时间查询账号交易记录")
    public void findUserTransactionRecords() {
        List<TransactionRecordDTO> userTransactionRecords = bankAccountService.findUserTransactionRecords(idUser.toString(), "", "");
        assertTrue(userTransactionRecords.isEmpty());
    }
}